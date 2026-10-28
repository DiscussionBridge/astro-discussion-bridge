import { createHash, randomUUID } from "node:crypto";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { cmsNativeLocation, cmsNativeReservation, withCmsCoordinator, type CmsCoordinatorOptions } from "./cms-coordinator.js";
import { type CmsAuthority, type CmsMapping, type CmsSource, type CmsWorkQuery } from "./cms-client.js";
import { type CmsNativeState, type CmsNativeTransaction } from "./cms-state.js";
import { nativePublicationFiles } from "./native-publication.js";
import { verifyCmsAbsence, verifyCmsPublication, type CmsDeploymentReceipt } from "./cms-verification.js";
import { nativeOwnershipReceiptSha256, validateCms } from "../src/private/cms-runtime.mjs";
import { NativeMediaUnsupportedError } from "./native-media.js";
import { assertNativeArticleCapture, captureNativeArticle, NativePreparationLimitation } from "./native-preparation.js";

type NativeResult = { kind: "publish_revision" | "withdraw"; native_id: string; external_id: string; canonical_url: string; native_revision: string | null; ownership_receipt_sha256: string; representation?: { kind: "full"; source_content_sha256: string } };
export interface StagePlan { file: string; previous: string | null; output: string; nativeResult: NativeResult; source: CmsSource | null; mapping: CmsMapping; moveProof?: import("./cms-verification.js").CmsMoveExpectation }
type Transaction = CmsNativeTransaction & { plan?: StagePlan; prepareBody?: { mutation_id: string; authority: CmsAuthority; transaction_id: string; native_result: NativeResult; prepared_at: string }; preparedAt?: string;
  buildArtifact?: { html: string | null; sha256: string | null; builtAt: string };
  finalizeBody?: { mutation_id: string; authority: CmsAuthority; transaction_id: string; deployment_id: string; deployed_at: string; verification: ReturnType<typeof validateCms> };
  abortBody?: { mutation_id: string; authority: CmsAuthority; transaction_id: string; native_restored: boolean; safe_detail: string | null };
  failureBody?: { mutation_id: string; authority: CmsAuthority; code: string; native_change_applied: boolean; safe_detail: string | null; retry_after_seconds: null };
  publiclyVerifiedAt?: string;
};
const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const publicationBody = (contents: string) => contents.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, "");
const nativeRevisionFor = (body: string, fields: Record<string, unknown>) => hash(JSON.stringify([body, fields.discussionbridgeNativeManagedFields, fields.discussionbridgeSourceStatus]));
const text = (value: string) => value.replace(/[&<>"']/gu, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export const cmsAuthority = (transaction: CmsNativeTransaction): CmsAuthority => ({
  work_id: transaction.lease.work.work_id, lease_token: transaction.lease.lease_token, lease_generation: transaction.lease.lease_generation,
  source_revision: transaction.lease.work.source_revision, policy_revision: transaction.lease.work.policy_revision,
});

function assertRenewed(transaction: Transaction, lease: Transaction["lease"]) {
  const old = transaction.lease;
  if (lease.lease_token !== old.lease_token || lease.lease_generation !== old.lease_generation || ["work_id", "mapping_id", "source_id", "source_revision", "policy_revision", "action", "lease_generation"].some(key => lease.work[key as keyof typeof lease.work] !== old.work[key as keyof typeof old.work])) throw new Error("CMS renewal changed native authority bindings.");
}

function assertCurrent(state: CmsNativeState, transaction: Transaction, current: CmsWorkQuery) {
  const work = transaction.lease.work;
  for (const key of ["work_id", "mapping_id", "source_id", "source_revision", "policy_revision", "action", "lease_generation"] as const) {
    if (current.work[key] !== work[key]) throw new Error("CMS work authority changed; native reconciliation is required.");
  }
  if (!["leased", "synchronized", "deployed"].includes(current.work.state) || current.mapping.mapping_id !== work.mapping_id || current.mapping.source_id !== work.source_id
    || current.mapping.connection_id !== state.connectionId || current.mapping.desired_source_revision !== work.source_revision || state.generations[work.mapping_id] !== transaction.lease.lease_generation) throw new Error("CMS work generation or mapping no longer authorizes native mutation.");
}

function sourceFor(state: CmsNativeState, transaction: Transaction): CmsSource {
  const work = transaction.lease.work;
  const recovery = transaction.attentionRecovery as import("./cms-attention-types.js").AttentionRecovery | undefined;
  if (recovery?.source && recovery.work.work_id === work.work_id && recovery.source.source_id === work.source_id && recovery.source.source_revision === work.source_revision) return recovery.source;
  for (const event of Object.values(state.events)) if (event.event_type === "publication" && event.source.source_id === work.source_id && event.source.source_revision === work.source_revision) return event.source;
  throw new Error("CMS exact desired source metadata has not been durably staged.");
}

function validateNativeOwnership(contents: string, mapping: CmsMapping, nativeId: string, state: CmsNativeState) {
  const fields = nativePublicationFiles.metadata(contents);
  const receipt = fields?.discussionbridgeCmsOwnership as Record<string, unknown> | undefined;
  validateCms("NativeOwnershipReceipt", receipt);
  if (!fields || !receipt || receipt.connection_id !== state.connectionId || receipt.mapping_id !== mapping.mapping_id || receipt.resource_id !== mapping.resource_id || receipt.source_id !== mapping.source_id
    || receipt.external_id !== mapping.external_id || receipt.native_id !== nativeId || receipt.canonical_url !== mapping.canonical_url || receipt.forum_origin !== state.serviceOrigin
    || fields.discussionbridgeCmsOwnershipSha256 !== nativeOwnershipReceiptSha256(receipt)
    || fields.discussionbridgeNativeBodySha256 !== nativePublicationFiles.bodyDigest(contents)) throw new Error("CMS actual native ownership or managed content requires reconciliation.");
  if (Number(receipt.last_lease_generation) > (state.generations[mapping.mapping_id] ?? 0)) throw new Error("CMS native receipt has a newer fencing generation.");
  const managed = fields.discussionbridgeNativeManagedFields as Record<string, unknown> | undefined;
  if (!managed || typeof managed !== "object" || Array.isArray(managed) || Object.entries(managed).some(([key, value]) => !["title", "description", "discussionCommentsDisplay", "date"].includes(key) || fields[key] !== value)
    || fields.discussionbridgeCmsNativeRevision !== nativeRevisionFor(publicationBody(contents), fields)) throw new Error("CMS managed native fields were edited locally.");
  return fields;
}

export async function prepareCmsNativeWork(options: CmsCoordinatorOptions, workId: string) {
  return withCmsCoordinator(options, async ({ client, state, connection, save }) => {
    const transaction = state.transactions[workId] as Transaction | undefined;
    if (!transaction || ["verified", "aborted", "attention"].includes(transaction.stage)) throw new Error("CMS work has no resumable held native transaction.");
    if (transaction.localLimitation) throw new Error(transaction.localLimitation.detail);
    if (transaction.presentationMove && (transaction.presentationMove as { phase: string }).phase !== "committed") throw new Error("CMS URL move must commit before static publication prepare.");
    const current = await client.query(workId);
    assertCurrent(state, transaction, current);
    const work = transaction.lease.work;
    for (const other of Object.values(state.transactions)) {
      if (other !== transaction && other.lease.work.mapping_id === work.mapping_id && ["staged", "prepared"].includes(other.stage)) throw new Error("A prior native staged result must be reconciled before another create or update.");
    }
    if (current.mapping.presentation_mode !== connection.policy.presentation_mode) throw new Error("CMS current desired native presentation requires attention.");
    if (!transaction.plan) {
      const source = work.action === "publish_revision" ? sourceFor(state, transaction) : null;
      const reservation = cmsNativeLocation(options, state, work.source_id);
      const nativeId = current.mapping.destination_native_id ?? reservation.nativeId;
      if (nativeId !== reservation.nativeId || current.mapping.external_id !== reservation.externalId || current.mapping.canonical_url !== reservation.canonicalUrl) throw new Error("CMS native identity or URL has changed; explicit reconciliation is required.");
      const prior = await nativePublicationFiles.readExisting(reservation.file);
      const priorFields = prior ? validateNativeOwnership(prior.contents, current.mapping, nativeId, state) : {};
      if (prior && current.mapping.destination_native_revision !== priorFields.discussionbridgeCmsNativeRevision) throw new Error("CMS expected native revision does not match its actual owned object.");
      if (!prior && (work.action === "withdraw" || current.mapping.destination_native_id !== null)) throw new Error("CMS expected native object is missing; a second create is not authorized.");
      let body: string;
      const fields: Record<string, unknown> = { ...priorFields };
      if (source) {
        const topicUrl = new URL(source.topic_url);
        const topic = /\/t\/(?:[^/]+\/)?([1-9]\d*)(?:\/1)?\/?$/u.exec(topicUrl.pathname);
        if (topicUrl.origin !== client.origin || !topic || topic[1] !== source.topic_id || /%2f|%5c/iu.test(topicUrl.pathname)) throw new Error("CMS source discussion origin or topic identity requires attention.");
        const completeContent = await client.content(source);
        transaction.articleCapture ??= captureNativeArticle(completeContent, source.topic_url, "cooked_html");
        const originalCapture = transaction.articleCapture as import("./native-preparation.js").NativeArticleCapture;
        assertNativeArticleCapture(originalCapture);
        if (originalCapture.original !== completeContent || originalCapture.sourceArticleUrl !== source.topic_url) throw new Error("CMS original source article capture differs from its exact source edition.");
        await save(); // Complete incoming integrity was checked before any conversion.
        let content: string;
        try { const preparation = nativePublicationFiles.sanitize(completeContent, source.topic_url); transaction.articleCapture = preparation; content = preparation.preparedHtml!; await save(); }
        catch (error) {
          if (error instanceof NativePreparationLimitation) {
            // This known writer limitation has no general receiver Failure code.
            // Retain current complete source/work, with no native mutation or renewal.
            transaction.localLimitation = { kind: error instanceof NativeMediaUnsupportedError ? "media_preservation" : "native_preparation", detail: error.message, source, content: completeContent, recordedAt: new Date().toISOString() };
            await save();
          }
          throw error;
        }
        const authors = source.source_authors.map(author => `<span data-source-author-id="${text(author.id)}">${text(author.name)}</span>`).join(", ");
        body = `\n<div data-discussionbridge-cms-content="${current.mapping.resource_id}">\n${content}\n\n<hr>\n<aside class="discussionbridge-publication"><p>Published from <a href="${text(source.topic_url)}">${text(connection.forum_name)}</a></p>${authors ? `<p>Source authors: ${authors}</p>` : ""}${source.source_updated_at === null ? "<p>Source update date unknown.</p>" : `<p>Updated <time datetime="${source.source_updated_at}">${source.source_updated_at}</time></p>`}</aside>\n</div>\n`;
        Object.assign(fields, { title: source.title, description: `Published from ${connection.forum_name}.`, discussionCommentsDisplay: current.mapping.presentation_mode, discussionbridgeCmsMode: current.mapping.presentation_mode,
          discussionSync: false, discussionFromDiscourse: true, discussionbridgeNativePublication: true, discussionbridgeResourceId: current.mapping.resource_id, discourseTopicId: source.topic_id, discourseTopicUrl: source.topic_url,
          discussionbridgeSourceRevision: source.source_revision, discussionbridgeSourceCreatedAt: source.source_created_at, discussionbridgeSourceUpdatedAt: source.source_updated_at, discussionbridgeForumName: connection.forum_name,
          discussionbridgeCmsSourceContentSha256: source.content_sha256, discussionbridgeSourceStatus: "active" });
        fields.discussionbridgeSourceAuthors = source.source_authors;
        if (source.source_created_at === null) { if (Object.hasOwn(priorFields.discussionbridgeNativeManagedFields ?? {}, "date")) delete fields.date; }
        else fields.date = source.source_created_at;
        fields.discussionbridgeNativeManagedFields = { title: fields.title, description: fields.description, discussionCommentsDisplay: fields.discussionCommentsDisplay, ...(source.source_created_at === null ? {} : { date: fields.date }) };
        if (priorFields.discussionbridgeSourceStatus === "withdrawn") {
          const priorDraft = priorFields.discussionbridgePriorDraft as { present: boolean; value: unknown } | undefined;
          if (!priorDraft) throw new Error("CMS native restoration lacks its previous draft choice.");
          if (priorDraft.present) fields.draft = priorDraft.value; else delete fields.draft;
          delete fields.discussionbridgePriorDraft;
        }
      } else {
        body = publicationBody(prior!.contents);
        if (priorFields.discussionbridgeSourceStatus !== "withdrawn") fields.discussionbridgePriorDraft = { present: Object.hasOwn(priorFields, "draft"), value: priorFields.draft ?? null };
        fields.draft = true; fields.discussionbridgeSourceStatus = "withdrawn";
      }
      const receipt = { schema_version: "db-native-ownership-1", forum_origin: state.serviceOrigin, connection_id: state.connectionId, mapping_id: current.mapping.mapping_id, resource_id: current.mapping.resource_id,
        source_id: work.source_id, external_id: current.mapping.external_id, native_id: nativeId, canonical_url: current.mapping.canonical_url,
        source_revision: source?.source_revision ?? (priorFields.discussionbridgeCmsOwnership as Record<string, unknown>).source_revision,
        last_lease_generation: transaction.lease.lease_generation, move_id: null, proof_nonce: null };
      const ownershipHash = nativeOwnershipReceiptSha256(receipt);
      const nativeRevision = nativeRevisionFor(body, fields);
      Object.assign(fields, { discussionbridgeCmsOwnership: receipt, discussionbridgeCmsOwnershipSha256: ownershipHash, discussionbridgeCmsNativeRevision: nativeRevision, discussionbridgeNativeBodySha256: hash(body) });
      const output = `---\n${stringifyYaml(fields).trim()}\n---\n${body}`;
      const nativeResult: NativeResult = { kind: work.action, native_id: nativeId, external_id: current.mapping.external_id, canonical_url: current.mapping.canonical_url, native_revision: nativeRevision, ownership_receipt_sha256: ownershipHash,
        ...(source ? { representation: { kind: "full" as const, source_content_sha256: source.content_sha256 } } : {}) };
      validateCms("SyncResult", nativeResult);
      transaction.plan = { file: reservation.file, previous: prior?.contents ?? null, output, nativeResult, source, mapping: current.mapping };
      await save();
    }
    const plan = transaction.plan;
    validateCms("SyncResult", plan.nativeResult);
    validateCms("Mapping", plan.mapping);
    if (plan.file !== cmsNativeReservation(options, { source_id: work.source_id }).file || plan.mapping.mapping_id !== work.mapping_id || plan.nativeResult.canonical_url !== current.mapping.canonical_url || plan.nativeResult.native_id !== (current.mapping.destination_native_id ?? plan.nativeResult.native_id)) throw new Error("CMS staged native path or bindings require reconciliation.");
    const existing = await nativePublicationFiles.readExisting(plan.file);
    if (existing?.contents !== plan.output) {
      if ((existing?.contents ?? null) !== plan.previous) throw new Error("CMS staged native target changed; reconciliation is required.");
      const renewed = await client.renew(randomUUID(), cmsAuthority(transaction));
      assertRenewed(transaction, renewed);
      transaction.lease = renewed;
      assertCurrent(state, transaction, await client.query(workId));
      await save();
      await nativePublicationFiles.write(plan.file, plan.output, existing);
    } else validateNativeOwnership(existing.contents, plan.mapping, plan.nativeResult.native_id, state);
    transaction.stage = "staged";
    transaction.preparedAt ??= new Date().toISOString();
    transaction.prepareBody ??= { mutation_id: randomUUID(), authority: cmsAuthority(transaction), transaction_id: transaction.transactionId, native_result: plan.nativeResult, prepared_at: transaction.preparedAt };
    if (transaction.prepareBody.authority.lease_generation !== transaction.lease.lease_generation) {
      transaction.prepareBody = { ...transaction.prepareBody, mutation_id: randomUUID(), authority: cmsAuthority(transaction) };
    }
    await save();
    const response = await client.request<CmsWorkQuery>("V4-18", { path: { work_id: workId }, body: transaction.prepareBody });
    assertCurrent(state, transaction, response);
    if (response.work.state !== "synchronized" || response.mapping.destination_native_id !== plan.nativeResult.native_id || response.mapping.destination_native_revision !== plan.nativeResult.native_revision) throw new Error("CMS static prepare did not confirm the exact staged native result.");
    transaction.stage = "prepared";
    state.mappings[work.source_id] = response.mapping;
    await save();
    return { workId, transactionId: transaction.transactionId, nativeId: plan.nativeResult.native_id, canonicalUrl: plan.nativeResult.canonical_url, stage: transaction.stage };
  });
}

function checkedPlan(options: CmsCoordinatorOptions, state: CmsNativeState, transaction: Transaction): StagePlan {
  const plan = transaction.plan, work = transaction.lease.work;
  if (!plan || !transaction.preparedAt) throw new Error("CMS exact prepared native transaction is unavailable.");
  validateCms("StaticPreparation", transaction.prepareBody); validateCms("Mapping", plan.mapping); validateCms("SyncResult", plan.nativeResult); validateCms("Instant", transaction.preparedAt);
  const reservation = cmsNativeLocation(options, state, work.source_id);
  if (plan.file !== reservation.file || plan.nativeResult.native_id !== reservation.nativeId || plan.nativeResult.external_id !== reservation.externalId || plan.nativeResult.canonical_url !== reservation.canonicalUrl
    || plan.mapping.mapping_id !== work.mapping_id || plan.mapping.source_id !== work.source_id || plan.mapping.connection_id !== state.connectionId || plan.nativeResult.kind !== work.action
    || transaction.prepareBody?.transaction_id !== transaction.transactionId || JSON.stringify(transaction.prepareBody.native_result) !== JSON.stringify(plan.nativeResult)) throw new Error("CMS prepared native transaction bindings require reconciliation.");
  if (typeof plan.output !== "string" || plan.previous !== null && typeof plan.previous !== "string") throw new Error("CMS native restoration bytes are unavailable.");
  if (work.action === "publish_revision") { validateCms("Source", plan.source); if (plan.source?.source_revision !== work.source_revision || plan.source?.source_id !== work.source_id) throw new Error("CMS prepared source identity requires reconciliation."); }
  return plan;
}

async function exactNativePlan(state: CmsNativeState, plan: StagePlan) {
  const actual = await nativePublicationFiles.readExisting(plan.file);
  if (!actual || actual.contents !== plan.output) throw new Error("CMS prepared native object changed before build or settlement.");
  validateNativeOwnership(actual.contents, plan.mapping, plan.nativeResult.native_id, state);
  return actual;
}

async function builtArtifact(buildDir: string, canonicalUrl: string, notBefore?: string): Promise<string | null> {
  const directory = path.resolve(buildDir);
  const url = new URL(canonicalUrl);
  if (!/^\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/u.test(url.pathname) || url.search || url.hash) throw new Error("CMS native build route requires explicit reconciliation.");
  const file = path.resolve(directory, `.${url.pathname}`, "index.html");
  if (!file.startsWith(directory + path.sep)) throw new Error("CMS native build path escaped its configured directory.");
  await nativePublicationFiles.assertDirectory(path.dirname(file));
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const before = await lstat(file, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink()) throw new Error("CMS build artifact requires an unlinked regular file.");
    handle = await open(file, "r"); const actual = await handle.stat({ bigint: true });
    if (before.dev !== actual.dev || before.ino !== actual.ino) throw new Error("CMS native build artifact changed before reading.");
    if (notBefore && Number(actual.mtimeMs) < Date.parse(notBefore)) throw new Error("CMS native move requires an actual newly built artifact after its current prepare boundary.");
    return new TextDecoder("utf-8", { fatal: true }).decode(await handle.readFile());
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  finally { await handle?.close(); }
}

/** Native post-build hook captures the actual complete artifact before deployment. */
export async function recordCmsNativeBuild(options: CmsCoordinatorOptions, buildDir: string) {
  const relative = path.relative(path.resolve(buildDir), path.resolve(options.stateFile));
  if (relative === "" || relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)) throw new Error("CMS server-only journal must stay outside native public build output.");
  return withCmsCoordinator(options, async ({ client, state, save }) => {
    const recorded: string[] = [];
    for (const [workId, raw] of Object.entries(state.transactions)) {
      const transaction = raw as Transaction;
      if (transaction.stage !== "prepared" || transaction.finalizeBody || transaction.abortBody || transaction.failureBody) continue;
      const deployment = state.nativeCommand as { phase: string; workIds: string[] } | undefined;
      if (transaction.buildArtifact && deployment?.phase === "succeeded" && deployment.workIds.includes(workId) && (deployment as { phases?: Record<string, string> }).phases?.[workId] !== "move") continue;
      const plan = checkedPlan(options, state, transaction);
      assertCurrent(state, transaction, await client.query(workId)); await exactNativePlan(state, plan);
      const html = await builtArtifact(buildDir, plan.nativeResult.canonical_url, plan.moveProof ? transaction.preparedAt : undefined);
      if (plan.nativeResult.kind === "publish_revision" ? html === null : html !== null) throw new Error("CMS actual build output does not match the prepared publication/withdrawal action.");
      transaction.buildArtifact = { html, sha256: html === null ? null : hash(html), builtAt: new Date().toISOString() };
      await save(); recorded.push(workId);
    }
    return { recorded };
  });
}

/** Internal native primitives shared by ordinary publication and URL movement. */
export const cmsStaticNative = { hash, publicationBody, nativeRevisionFor, assertRenewed, assertCurrent, sourceFor, validateNativeOwnership, builtArtifact };

export interface CmsFinalizeOptions extends CmsCoordinatorOptions { publicFetchImplementation?: typeof fetch }

/** Deployment is caller-owned; this method executes only anonymous proof and exact settlement. */
export async function finalizeCmsNativeWork(options: CmsFinalizeOptions, workId: string, deployment: CmsDeploymentReceipt) {
  return withCmsCoordinator(options, async ({ client, state, save }) => {
    const transaction = state.transactions[workId] as Transaction | undefined;
    if (transaction?.failureBody) {
      validateCms("Failure", transaction.failureBody);
      const response = await client.request<CmsWorkQuery>("V4-17", { path: { work_id: workId }, body: transaction.failureBody });
      if (response.work.work_id !== workId || response.work.state !== "attention") throw new Error("CMS exact verification failure receipt requires reconciliation.");
      transaction.stage = "attention"; state.mappings[response.mapping.source_id] = (await client.query(workId)).mapping; await save();
      throw new Error("CMS actual public verification failed; native reconciliation is required, with no automatic retry or rollback.");
    }
    if (!transaction || transaction.abortBody || transaction.failureBody || !["prepared", "verified"].includes(transaction.stage)) throw new Error("CMS work has no prepared native result eligible for finalization.");
    const plan = checkedPlan(options, state, transaction);
    validateCms("OpaqueId", deployment.deploymentId); validateCms("Instant", deployment.deployedAt);
    if (transaction.finalizeBody) {
      validateCms("StaticFinalize", transaction.finalizeBody);
      if (transaction.finalizeBody.deployment_id !== deployment.deploymentId || transaction.finalizeBody.deployed_at !== deployment.deployedAt) throw new Error("An uncertain CMS finalize must replay the exact deployment receipt.");
    } else {
      assertCurrent(state, transaction, await client.query(workId)); await exactNativePlan(state, plan);
      const artifact = transaction.buildArtifact;
      if (!artifact || Date.parse(deployment.deployedAt) < Date.parse(artifact.builtAt)) throw new Error("CMS actual post-build artifact or later deployment receipt is unavailable.");
      validateCms("Instant", artifact.builtAt);
      if (artifact.html !== null && artifact.sha256 !== hash(artifact.html)) throw new Error("CMS durable built artifact changed; native reconciliation is required.");
      const renewed = await client.renew(randomUUID(), cmsAuthority(transaction));
      assertRenewed(transaction, renewed);
      transaction.lease = renewed; await save();
      let verification: unknown;
      try {
        verification = plan.source
          ? await verifyCmsPublication({ nativeId: plan.nativeResult.native_id, resourceId: plan.mapping.resource_id, url: plan.nativeResult.canonical_url, source: plan.source,
            mode: plan.mapping.presentation_mode, stagedMarkdownBody: publicationBody(plan.output), builtHtml: artifact.html!, preparedAt: transaction.preparedAt!, move: plan.moveProof }, deployment, options.publicFetchImplementation)
          : await verifyCmsAbsence(plan.nativeResult.canonical_url, plan.nativeResult.native_id, transaction.preparedAt!, deployment, options.publicFetchImplementation);
      } catch {
        // A permanent verification failure surrenders authority. It cannot be
        // followed by a newly invented attention→StaticAbort transition.
        transaction.failureBody = { mutation_id: randomUUID(), authority: cmsAuthority(transaction), code: "public_verification_failed", native_change_applied: true, safe_detail: "Actual anonymous native publication verification failed.", retry_after_seconds: null };
        await save();
        const response = await client.request<CmsWorkQuery>("V4-17", { path: { work_id: workId }, body: transaction.failureBody });
        if (response.work.state !== "attention") throw new Error("CMS verification failure did not confirm attention.");
        transaction.stage = "attention"; state.mappings[plan.mapping.source_id] = response.mapping; await save();
        throw new Error("CMS actual public verification failed; native reconciliation is required, with no automatic retry or rollback.");
      }
      assertCurrent(state, transaction, await client.query(workId)); await exactNativePlan(state, plan);
      transaction.finalizeBody = { mutation_id: randomUUID(), authority: cmsAuthority(transaction), transaction_id: transaction.transactionId,
        deployment_id: deployment.deploymentId, deployed_at: deployment.deployedAt, verification };
      validateCms("StaticFinalize", transaction.finalizeBody); await save();
    }
    const receipt = await client.request<CmsWorkQuery>("V4-19", { path: { work_id: workId }, body: transaction.finalizeBody });
    if (receipt.work.work_id !== workId || receipt.work.state !== "verified" || receipt.work.action !== transaction.lease.work.action || receipt.work.source_revision !== transaction.lease.work.source_revision
      || receipt.mapping.mapping_id !== plan.mapping.mapping_id || receipt.mapping.destination_native_id !== plan.nativeResult.native_id || receipt.mapping.publicly_verified_at !== (transaction.finalizeBody.verification as { checked_at: string }).checked_at) throw new Error("CMS finalize did not confirm the exact action-matching public result.");
    // Idempotent replay returns an historical receipt; read current mapping state
    // separately rather than presenting that old response as current authority.
    const current = await client.query(workId);
    if (current.work.work_id !== workId || current.mapping.mapping_id !== plan.mapping.mapping_id) throw new Error("CMS current settlement binding requires reconciliation.");
    transaction.stage = "verified"; transaction.publiclyVerifiedAt = (transaction.finalizeBody.verification as { checked_at: string }).checked_at;
    state.mappings[plan.mapping.source_id] = current.mapping; await save();
    return { workId, transactionId: transaction.transactionId, stage: transaction.stage, publiclyVerifiedAt: transaction.publiclyVerifiedAt };
  });
}

/** Explicit rollback of only this exact owned native file; never deployment rollback. */
export async function abortCmsNativeWork(options: CmsCoordinatorOptions, workId: string) {
  return withCmsCoordinator(options, async ({ client, state, save }) => {
    const transaction = state.transactions[workId] as Transaction | undefined;
    if (!transaction || transaction.finalizeBody || transaction.failureBody || !["prepared", "aborted", "attention"].includes(transaction.stage)) throw new Error("CMS work has no current static transaction eligible for explicit abort.");
    const plan = checkedPlan(options, state, transaction);
    if (!transaction.abortBody) {
      assertCurrent(state, transaction, await client.query(workId));
      const renewed = await client.renew(randomUUID(), cmsAuthority(transaction)); assertRenewed(transaction, renewed); transaction.lease = renewed;
      assertCurrent(state, transaction, await client.query(workId)); await save();
      let nativeRestored = false;
      const actual = await nativePublicationFiles.readExisting(plan.file);
      if ((actual?.contents ?? null) === plan.previous) nativeRestored = true;
      else if (actual?.contents === plan.output) {
        validateNativeOwnership(actual.contents, plan.mapping, plan.nativeResult.native_id, state);
        if (plan.previous === null) await nativePublicationFiles.remove(plan.file, actual);
        else await nativePublicationFiles.write(plan.file, plan.previous, actual);
        nativeRestored = ((await nativePublicationFiles.readExisting(plan.file))?.contents ?? null) === plan.previous;
      }
      transaction.abortBody = { mutation_id: randomUUID(), authority: cmsAuthority(transaction), transaction_id: transaction.transactionId, native_restored: nativeRestored,
        safe_detail: nativeRestored ? "Exact prior owned native file state restored; deployment rollback remains caller-owned." : "Native target changed; no local edits were overwritten and actual restoration is not established." };
      validateCms("StaticAbort", transaction.abortBody); await save();
    }
    validateCms("StaticAbort", transaction.abortBody);
    const response = await client.request<CmsWorkQuery>("V4-20", { path: { work_id: workId }, body: transaction.abortBody });
    if (response.work.work_id !== workId || response.work.state !== "attention" || response.mapping.mapping_id !== plan.mapping.mapping_id) throw new Error("CMS static abort did not confirm attention for this transaction.");
    transaction.stage = transaction.abortBody.native_restored ? "aborted" : "attention";
    state.mappings[plan.mapping.source_id] = (await client.query(workId)).mapping; await save();
    return { workId, transactionId: transaction.transactionId, stage: transaction.stage, nativeRestored: transaction.abortBody.native_restored };
  });
}
