import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { lstat } from "node:fs/promises";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import { CmsClient, CmsRequestError, type CmsClientOptions, type CmsConnection } from "./cms-client.js";
import { assertCmsTopicUrl, cmsToFingerprint, resolveCmsToPage, type CmsToPage, type CmsToRecordMetadata, type CmsToRevocationReason } from "./cms-to.js";
import { validateCms, semanticIdentity } from "../src/private/cms-runtime.mjs";
import { cmsServiceBaseUrl as parseServiceBaseUrl, sameCmsOrigin, type NativeUrl } from "./native-url.js";
import { nativePublicationFiles } from "./native-publication.js";
import { captureNativeArticle, nativeCaptureId, NativeAssetRenderRequired, NativePreparationLimitation } from "./native-preparation.js";
import { withNativeSourceWriter } from "./native-locks.js";
import { beginPublicationAttempt, readPublicationOperationalState, writePublicationOperationalState, type NativeRenderIntent, type PublicationOperation, type PublicationOperationalState } from "./operational-state.js";
import { findMarkdownFiles, readMarkdownSources, parseMarkdown, pageUrlForFile, stableExternalId, validateRouteBase, nativeLifecycle,
  createNativeMarkdownRenderer, prepareNativeRenderedArticle, renderedPublishedContent, sourceDate, firstHeading, titleFromFile, updateFrontmatter, excerptArticle } from "./native-source.js";
import { activeSourceMove } from "./cms-to-source-state.js";
import { captureSourceNativeUnderWriter, sourcePreparationBase } from "./cms-to-source-move.js";
import { sourceHash, sourceOriginalKey, resolveNativeSourceTargets } from "./to-source-profile.js";
import { assertActualSourceBuild } from "./cms-to-source-build.js";

export interface ControlledCreationOptions extends Omit<CmsClientOptions, "serverUrl"> { lane?: string }
export interface PublishControlledDiscussionsOptions { docsDir: string; stateFile: string; siteUrl: string; discourseUrl: string; routeBase?: string; controlledCreation: ControlledCreationOptions }
export interface ControlledDiscussionResult { filePath: string; pageUrl: string; resourceId?: string; topicId?: string; topicUrl?: string; status: "created" | "resolved" | "updated" | "withdrawn" | "skipped"; reason?: string }
interface PreparedPage extends CmsToPage { filePath: string; source: string }

/** One current native publisher, with complete identity census before dispatch. */
export async function publishControlledDiscussions(options: PublishControlledDiscussionsOptions): Promise<ControlledDiscussionResult[]> {
  const docsDir = path.resolve(options.docsDir), stateFile = path.resolve(options.stateFile);
  return withNativeSourceWriter(docsDir, stateFile, async () => {
    const state = await readPublicationOperationalState(stateFile), siteBase = parseServiceBaseUrl(options.siteUrl), routeBase = validateRouteBase(options.routeBase);
    const client = new CmsClient({ serverUrl: options.discourseUrl, ...options.controlledCreation }), connection = await client.connection();
    const root = await lstat(docsDir, { bigint: true });
    if (!root.isDirectory() || root.isSymbolicLink() || root.ino <= 0n) throw new Error("Native source census requires its actual unlinked root identity.");
    const scope = { docsDir, siteBase: siteBase.href, routeBase, rootDev: String(root.dev), rootIno: String(root.ino) };
    if (state.nativeCensus && semanticIdentity(state.nativeCensus) !== semanticIdentity(scope)) throw new Error("Native source census scope/root changed; no disappearance may be inferred.");
    for (const operation of Object.values(state.operations)) if (operation.to) assertLifecycleScope(options, operation, client, connection);
    const census: (PreparedPage | NativeRenderIntent | ControlledDiscussionResult)[] = [], externalIds = new Set<string>(), resourceIds = new Set<string>(), topicIds = new Set<string>(), canonicalUrls = new Set<string>();
    const native = new Map<string, { source: string; lifecycle: ReturnType<typeof nativeLifecycle> }>();
    const files = await findMarkdownFiles(docsDir);
    let renderer: Awaited<ReturnType<typeof createNativeMarkdownRenderer>> | undefined;
    for await (const entry of readMarkdownSources(files)) {
      const { frontmatter: data, body } = parseMarkdown(entry.source);
      native.set(entry.filePath, { source: entry.source, lifecycle: nativeLifecycle(data) });
      const pageUrl = pageUrlForFile({ docsDir, filePath: entry.filePath, siteBase, routeBase, slug: data.slug, hasSlug: Object.hasOwn(data, "slug") });
      if (nativeLifecycle(data) !== "published") { census.push({ filePath: entry.filePath, pageUrl, status: "skipped", reason: "Native source is unpublished or ineligible" }); continue; }
      const identity = captureBinding(data, siteBase, docsDir, entry.filePath, client.origin);
      const prior = state.operations[identity.externalId];
      if (identity.existingResourceId && Object.values(state.operations).some(operation => operation.externalId !== identity.externalId && (operation.resourceId === identity.existingResourceId || operation.topicId === identity.existingTopicId))) throw new Error("Native stored identity disagrees with its durable source owner.");
      if (prior?.to?.nativeSource && (prior.to.nativeSource.docsDir !== docsDir || prior.to.nativeSource.relativePath !== path.relative(docsDir, entry.filePath))) throw new Error("Native source identity/path changed; verified movement is required.");
      for (const [set, value] of [[externalIds, identity.externalId], [resourceIds, identity.existingResourceId], [topicIds, identity.existingTopicId ?? identity.coreTopicId], [canonicalUrls, pageUrl]] as const) {
        if (value !== undefined) { if (set.has(value)) throw new Error("Native source census contains duplicate/ambiguous external/resource/topic/URL identity."); set.add(value); }
      }
      if (activeSourceMove(prior?.to?.sourceMove)) {
        const move = prior!.to!.sourceMove!;
        const expected = entry.source === move.before || entry.source === move.output;
        if (!expected) move.lastError = "Actual native source changed during its owned source URL move; exact state retained for reconciliation.";
        census.push({ filePath: entry.filePath, pageUrl, status: "skipped", reason: expected ? "Native source URL move owns this exact source; ordinary02 is suppressed." : move.lastError });
        continue;
      }
      const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : firstHeading(body) ?? titleFromFile(entry.filePath); validateCms("Title", title);
      const authors = captureAuthors(data.authors, data.primaryAuthor);
      const createdAt = normalizedSourceDate(data.date), updatedAt = normalizedSourceDate(data.lastUpdated ?? data.updated_at);
      if (createdAt && updatedAt && updatedAt < createdAt) throw new Error("Native source chronology requires attention.");
      if (prior?.nativeRender && (prior.to?.pending?.rejection?.code === "invalid_field" || prior.to?.pending?.retryOf)) {
        // A known refusal from actual Content stays in that same capture phase;
        // a pre-build rendering must not silently replace the refused edition.
        census.push({ ...entry, pageUrl, title, ...identity, ...authors, createdAt, updatedAt, nativeRenderRequired: true,
          originalCapture: captureNativeArticle(body, sourcePreparationBase(prior, entry.source, pageUrl), "markdown") });
        continue;
      }
      renderer ??= await createNativeMarkdownRenderer();
      try {
        const captured = prior?.to?.nativeCapture, accepted = prior?.to?.articleCaptures?.[prior.to.acceptedCaptureId!];
        const preparation = captured && accepted && captured.originalKey === sourceOriginalKey(entry.source) && captured.canonicalUrl === pageUrl && captured.revision === prior!.to!.acceptedRevision && accepted.original === body
          ? structuredClone(accepted) : await renderedPublishedContent(body, entry.filePath, renderer, sourcePreparationBase(prior, entry.source, pageUrl));
        census.push({ ...entry, pageUrl, title, contentHtml: preparation.preparedHtml!, preparation, ...identity, ...authors, createdAt, updatedAt });
      } catch (error) {
        if (error instanceof NativeAssetRenderRequired && error.capture) {
          census.push({ ...entry, pageUrl, title, ...identity, ...authors, createdAt, updatedAt, nativeRenderRequired: true, originalCapture: error.capture });
          continue;
        }
        if (error instanceof NativePreparationLimitation && error.capture) {
          state.preparationLimitations ??= Object.create(null);
          state.preparationLimitations![nativeCaptureId(error.capture)] ??= { capture: error.capture, filePath: entry.filePath, detail: error.message };
          await writePublicationOperationalState(stateFile, state);
        }
        throw error;
      }
    }
    const checkedRoot = await lstat(docsDir, { bigint: true });
    if (checkedRoot.dev !== root.dev || checkedRoot.ino !== root.ino || semanticIdentity(await findMarkdownFiles(docsDir)) !== semanticIdentity(files)) throw new Error("Native source census changed before completion; no disappearance may be inferred.");
    const closures: { operation: PublicationOperation; file: string; reason: CmsToRevocationReason }[] = [];
    for (const operation of Object.values(state.operations)) {
      const owned = operation.to?.nativeSource;
      if (!owned) continue;
      if (owned.docsDir !== docsDir) throw new Error("Accepted native source belongs to another configured corpus; no disappearance may be inferred.");
      const file = path.resolve(docsDir, owned.relativePath), relative = path.relative(docsDir, file);
      if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Accepted native source path requires reconciliation.");
      const observed = native.get(file);
      if (activeSourceMove(operation.to?.sourceMove)) {
        if (!observed || observed.lifecycle !== "published") operation.to!.sourceMove!.lastError = "Actual native source closed/disappeared during its URL move; no ordinary02/05 or fabricated old ownership is inferred.";
        continue;
      }
      if (operation.to?.withdrawal?.phase === "withdrawn") continue;
      if (!state.nativeCensus && !observed) throw new Error("Missing accepted source has no prior complete native census scope; local reconciliation is required.");
      if (!observed || observed.lifecycle !== "published") closures.push({ operation, file, reason: operation.to?.withdrawal?.body.reason ?? (!observed ? "source_deleted" : observed.lifecycle === "unpublished" ? "source_unpublished" : "source_ineligible") });
    }
    // An earlier V4 state may establish this local guard only from present,
    // actually owned paths. It never reconstructs a missing prior corpus.
    if (!state.nativeCensus) {
      for (const operation of Object.values(state.operations)) if (operation.to?.nativeSource) await captureLifecycleSource(options, operation, path.resolve(docsDir, operation.to.nativeSource.relativePath));
      state.nativeCensus = scope; await writePublicationOperationalState(stateFile, state);
    }
    delete state.sourceBuildOwner; state.sourceBuildId = randomUUID(); await writePublicationOperationalState(stateFile, state);
    const results: ControlledDiscussionResult[] = [];
    for (const closure of closures) {
      const result = await withdrawUnderNativeWriter(options, closure.file, closure.reason, state, client, connection);
      results.push({ filePath: closure.file, pageUrl: result.canonical_url, resourceId: result.resource_id, topicId: result.topic_id, topicUrl: result.topic_url, status: "withdrawn", reason: closure.reason });
    }
    for (const entry of census) {
      if ("status" in entry) { if (!closures.some(closure => closure.file === entry.filePath)) results.push(entry); continue; }
      const operation = beginPublicationAttempt(state, entry.externalId, entry.pageUrl);
      if ("nativeRenderRequired" in entry) {
        const actual = await nativePublicationFiles.readExisting(entry.filePath);
        if (actual?.contents !== entry.source) throw new Error("Native asset source changed after the complete census; handoff was not replaced.");
        const previous = operation.nativeRender;
        if (previous && semanticIdentity(previous) !== semanticIdentity(entry)) {
          const accepted = operation.to?.acceptedResult;
          const ownCommit = accepted && updateFrontmatter(previous.source, bindingFields(previous.externalId, accepted));
          const rejected = operation.to?.pending?.rejection && operation.to.rejectedRequests?.[operation.to.pending.body.mutation_id];
          // A definite rejection is already retained with its complete capture.
          // Fresh current Content may be inspected; the source engine still
          // rejects identical snapshots and requires current predecessor CAS.
          if (!rejected && (!accepted || ownCommit !== entry.source || semanticIdentity(renderIdentity(previous)) !== semanticIdentity(renderIdentity(entry)))) throw new Error("Native render handoff changed before exact settlement; original intent/pending state requires reconciliation.");
        }
        operation.nativeRender = entry; operation.lastError = "Awaiting actual native Content rendering and asset URL capture; source remains published and no resolve has been inferred.";
        await writePublicationOperationalState(stateFile, state);
        results.push({ filePath: entry.filePath, pageUrl: entry.pageUrl, resourceId: operation.resourceId, topicId: operation.topicId, topicUrl: operation.topicUrl, status: "skipped", reason: operation.lastError });
        continue;
      }
      if (operation.nativeRender) throw new Error("Existing native render handoff requires reconciliation before another preparation path.");
      results.push(await publishPreparedUnderWriter(options, state, operation, entry, client, connection));
    }
    return results;
  });
}

const bindingFields = (externalId: string, result: import("./cms-to.js").CmsToResult) => ({ discussionbridgeExternalId: externalId, discussionbridgeResourceId: result.resource_id,
  discourseTopicId: result.topic_id, discourseTopicUrl: result.topic_url, discussionbridgeSourcePublicationRevision: result.source_revision });
const renderIdentity = (entry: NativeRenderIntent) => [entry.externalId, entry.pageUrl, entry.title, entry.originalCapture.original, entry.sourceAuthors ?? [], entry.primarySourceAuthorId ?? null, entry.createdAt, entry.updatedAt, entry.coreTopicId ?? null];

/** Shared by the original pre-build path and the actual native-render handoff. */
async function publishPreparedUnderWriter(options: PublishControlledDiscussionsOptions, state: PublicationOperationalState, operation: PublicationOperation, entry: PreparedPage, client: CmsClient, connection: CmsConnection, nativeRendered = false): Promise<ControlledDiscussionResult> {
  const stateFile = path.resolve(options.stateFile), docsDir = path.resolve(options.docsDir), source = await nativePublicationFiles.readExisting(entry.filePath);
  const assertCurrentNative = async () => {
    const current = await nativePublicationFiles.readExisting(entry.filePath);
    if (!source || !current || current.dev !== source.dev || current.ino !== source.ino || current.contents !== entry.source) throw new Error("Native source changed since capture; source publication requires reconciliation.");
  };
  try {
    const retry = Object.values(operation.to?.retryIntents ?? {}).find(intent => intent.phase === "armed");
    if (retry && retry.fingerprint === cmsToFingerprint(entry, options.controlledCreation.lane ?? connection.publication_lane)
      && (retry.native.docsDir !== docsDir || retry.native.relativePath !== path.relative(docsDir, entry.filePath) || retry.native.contentSha256 !== sourceHash(entry.source))) throw new Error("Selected source Retry native file changed after the explicit action; exact intent is retained for reconciliation.");
    await assertCurrentNative(); await writePublicationOperationalState(stateFile, state);
    const result = await resolveCmsToPage({ client, connection, operation, page: entry, lane: options.controlledCreation.lane, excerptArticle,
      persist: () => writePublicationOperationalState(stateFile, state), assertCurrentNative });
    await assertCurrentNative();
    const output = updateFrontmatter(entry.source, bindingFields(entry.externalId, result));
    if (output !== entry.source) await nativePublicationFiles.write(entry.filePath, output, source!);
    operation.to!.nativeSource = { docsDir, relativePath: path.relative(docsDir, entry.filePath) }; delete operation.to!.pending; delete operation.nativeRender; operation.outcome = result.outcome; delete operation.lastError;
    if (operation.to!.retainedSource && operation.to!.retainedSource.articleSha256 !== sourceHash(parseMarkdown(entry.source).body)) delete operation.to!.retainedSource;
    await writePublicationOperationalState(stateFile, state);
    return { filePath: entry.filePath, pageUrl: entry.pageUrl, resourceId: result.resource_id, topicId: result.topic_id, topicUrl: result.topic_url, status: result.outcome, reason: result.reason };
  } catch (error) {
    if (nativeRendered && operation.to?.pending?.rejection?.code === "invalid_field") operation.nativeRender ??= {
      filePath: entry.filePath, source: entry.source, pageUrl: entry.pageUrl, title: entry.title, externalId: entry.externalId,
      sourceAuthors: entry.sourceAuthors, primarySourceAuthorId: entry.primarySourceAuthorId, createdAt: entry.createdAt, updatedAt: entry.updatedAt,
      existingResourceId: entry.existingResourceId, existingTopicId: entry.existingTopicId, coreTopicId: entry.coreTopicId,
      nativeRenderRequired: true, originalCapture: captureNativeArticle(entry.preparation.original, entry.preparation.sourceArticleUrl, "markdown"),
    };
    operation.outcome = "attention"; operation.lastError = error instanceof NativePreparationLimitation || error instanceof CmsRequestError && error.code === "content_preservation_unavailable" ? error.message : "Native source publication requires operator attention; exact pending state is retained.";
    await writePublicationOperationalState(stateFile, state); throw error;
  }
}

export interface NativeRenderedSourceInput { filePath: string; sourceArticleUrl: string; nativeBody: string; render: () => Promise<string> }
/** Native collection caller; no new route, renderer or publication engine. */
export function captureNativeRenderedSource(options: PublishControlledDiscussionsOptions, input: NativeRenderedSourceInput) { return captureNativeRenderedSourceInner(options, input, false); }
/** Explicit full-source native profile binding; same writer/publication engine. */
export async function captureControlledSourceNative(options: PublishControlledDiscussionsOptions, input: NativeRenderedSourceInput) {
  const captured = await captureNativeRenderedSourceInner(options, input, true);
  if (!captured.source) throw new Error("Full native source capture did not produce its required actual source evidence.");
  return captured;
}
async function captureNativeRenderedSourceInner(options: PublishControlledDiscussionsOptions, input: NativeRenderedSourceInput, fullSource: boolean) {
  if (!path.isAbsolute(input.filePath) || typeof input.nativeBody !== "string" || typeof input.render !== "function") throw new Error("Native capture requires an actual physical source file, native entry body and Content render callback.");
  const docsDir = path.resolve(options.docsDir), stateFile = path.resolve(options.stateFile), file = path.resolve(input.filePath), relative = path.relative(docsDir, file);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Native capture file is outside its configured source corpus.");
  return withNativeSourceWriter(docsDir, stateFile, async () => {
    const state = await readPublicationOperationalState(stateFile), siteBase = parseServiceBaseUrl(options.siteUrl), routeBase = validateRouteBase(options.routeBase);
    if (fullSource) assertActualSourceBuild(state);
    const root = await lstat(docsDir, { bigint: true });
    if (!state.nativeCensus || semanticIdentity(state.nativeCensus) !== semanticIdentity({ docsDir, siteBase: siteBase.href, routeBase, rootDev: String(root.dev), rootIno: String(root.ino) })) throw new Error("Native render capture requires the unchanged completed native census scope/root.");
    const owners = Object.values(state.operations).filter(operation => operation.nativeRender?.filePath === file || operation.to?.nativeSource?.docsDir === docsDir && operation.to.nativeSource.relativePath === relative);
    if (owners.length !== 1) throw new Error("Native render capture requires exactly one durably censused source owner.");
    const operation = owners[0];
    try {
    const client = new CmsClient({ serverUrl: options.discourseUrl, ...options.controlledCreation }), connection = await client.connection();
    if (operation.to) assertLifecycleScope(options, operation, client, connection);
    if (activeSourceMove(operation.to?.sourceMove)) {
      if (!fullSource) throw new NativePreparationLimitation("Active source URL move requires its bound FULL native source profile; ordinary capture cannot dispatch02 or rebase the article.");
      return captureSourceNativeUnderWriter(options, state, operation, input, client, connection);
    }
    const actual = await nativePublicationFiles.readExisting(file);
    if (!actual) throw new Error("Native render source disappeared; no resolve or deletion is inferred from this callback.");
    const { frontmatter, body } = parseMarkdown(actual.contents);
    const pageUrl = pageUrlForFile({ docsDir, filePath: file, siteBase, routeBase, slug: frontmatter.slug, hasSlug: Object.hasOwn(frontmatter, "slug") });
    if (nativeLifecycle(frontmatter) !== "published" || input.sourceArticleUrl !== pageUrl || operation.canonicalUrl !== pageUrl || path.extname(file).toLowerCase() !== ".md"
      || input.nativeBody !== parseFrontmatter(actual.contents).content.trim()) throw new Error("Native render entry/source/base/published binding changed; exact handoff is retained without resolve.");
    const intent = operation.nativeRender;
    if (!intent) {
      if (!operation.to?.acceptedResult || operation.to.pending || operation.to.withdrawal || frontmatter.discussionbridgeSourcePublicationRevision !== operation.to.acceptedRevision) throw new Error("Native source has no settled current binding or resumable render handoff.");
      const capture = operation.to.articleCaptures?.[operation.to.acceptedCaptureId!];
      if (!capture || capture.original !== body || capture.sourceArticleUrl !== sourcePreparationBase(operation, actual.contents, pageUrl)) throw new Error("Native original differs from its settled captured article; no accepted snapshot is inferred from frontmatter alone.");
      if (fullSource) {
        const html = await input.render(), checked = await nativePublicationFiles.readExisting(file);
        if (!checked || checked.dev !== actual.dev || checked.ino !== actual.ino || checked.contents !== actual.contents) throw new Error("Native full-source preparation changed during rendering.");
        const prepared = prepareNativeRenderedArticle(capture, resolveNativeSourceTargets(html, capture.sourceArticleUrl));
        if (prepared.preparedSha256 !== capture.preparedSha256 || prepared.preparedBytes !== capture.preparedBytes) {
          const record = operation.to.effectiveEdition?.record ?? operation.to.acceptedBody!.bridge_record;
          await publishPreparedUnderWriter(options, state, operation, { filePath: file, source: actual.contents, preparation: prepared, contentHtml: prepared.preparedHtml!, pageUrl, title: record.title, externalId: operation.externalId,
            sourceAuthors: record.source_authors, primarySourceAuthorId: record.primary_source_author_id, createdAt: record.source_created_at, updatedAt: record.source_updated_at,
            existingResourceId: operation.resourceId, existingTopicId: operation.topicId }, client, connection, true);
        }
        return captureSourceNativeUnderWriter(options, state, operation, { ...input, render: async () => html }, client, connection);
      }
      return { frontmatter, result: operation.to.acceptedResult, source: undefined };
    }
    if (intent.source !== actual.contents || intent.originalCapture.original !== body) throw new Error("Native source differs from the staged render handoff; no intent is replaced.");
      const html = await input.render();
      const current = await nativePublicationFiles.readExisting(file);
      if (!current || current.dev !== actual.dev || current.ino !== actual.ino || current.contents !== actual.contents) throw new Error("Native source changed during Content rendering; no resolve was sent.");
      const preparation = prepareNativeRenderedArticle(intent.originalCapture, html);
      const result = await publishPreparedUnderWriter(options, state, operation, { ...intent, contentHtml: preparation.preparedHtml!, preparation }, client, connection, true);
      if (fullSource) return captureSourceNativeUnderWriter(options, state, operation, { ...input, render: async () => html }, client, connection);
      const committed = await nativePublicationFiles.readExisting(file); if (!committed) throw new Error("Committed native source is unavailable.");
      return { frontmatter: nativePublicationFiles.metadata(committed.contents)!, result, source: undefined };
    } catch (error) {
      operation.lastError = error instanceof Error ? error.message : "Actual native Content capture failed; handoff retained.";
      await writePublicationOperationalState(stateFile, state); throw error;
    }
  });
}

/** Protected selected-source action: stages one Retry; the normal build captures/publishes it. */
export async function stageControlledSourceRetry(options: PublishControlledDiscussionsOptions, sourceFile: string, refusedMutationId: string) {
  validateCms("UUID", refusedMutationId);
  const docsDir = path.resolve(options.docsDir), stateFile = path.resolve(options.stateFile), file = path.resolve(sourceFile), relative = path.relative(docsDir, file);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || path.extname(file).toLowerCase() !== ".md") throw new Error("Selected Retry requires its actual Markdown source inside the configured corpus.");
  return withNativeSourceWriter(docsDir, stateFile, async () => {
    const state = await readPublicationOperationalState(stateFile), root = await lstat(docsDir, { bigint: true });
    const siteBase = parseServiceBaseUrl(options.siteUrl), routeBase = validateRouteBase(options.routeBase);
    if (!state.nativeCensus || semanticIdentity(state.nativeCensus) !== semanticIdentity({ docsDir, siteBase: siteBase.href, routeBase, rootDev: String(root.dev), rootIno: String(root.ino) })) throw new Error("Selected Retry requires the unchanged complete native corpus scope/root.");
    const actual = await nativePublicationFiles.readExisting(file);
    if (!actual) throw new Error("Selected Retry source is unavailable; no request is replaced.");
    const { frontmatter: data, body } = parseMarkdown(actual.contents);
    if (nativeLifecycle(data) !== "published") throw new Error("Selected Retry requires a currently published eligible native source.");
    const forum = parseServiceBaseUrl(options.discourseUrl), identity = captureBinding(data, siteBase, docsDir, file, forum.origin);
    const operation = state.operations[identity.externalId], to = operation?.to, pending = to?.pending;
    if (!operation || !to || pending?.body.mutation_id !== refusedMutationId || pending.rejection?.code !== "invalid_field"
      || semanticIdentity(to.rejectedRequests?.[refusedMutationId]) !== semanticIdentity(pending)) throw new Error("Selected Retry requires the exact current request and retained witnessed typed To02 invalid_field/422 refusal; uncertain intent reconciles first.");
    if (to.retryIntents?.[refusedMutationId] || Object.values(to.retryIntents ?? {}).some(intent => intent.phase === "armed")) throw new Error("This selected Retry was already staged or consumed; a repeated/stale action cannot create another request.");
    if (to.withdrawal || activeSourceMove(to.sourceMove)) throw new Error("Native withdrawal/source URL movement must reconcile before Retry.");
    const pageUrl = pageUrlForFile({ docsDir, filePath: file, siteBase, routeBase, slug: data.slug, hasSlug: Object.hasOwn(data, "slug") });
    const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : firstHeading(body) ?? titleFromFile(file);
    const authors = captureAuthors(data.authors, data.primaryAuthor), record = pending.body.bridge_record, capture = pending.captureId ? to.articleCaptures?.[pending.captureId] : undefined;
    if (operation.canonicalUrl !== pageUrl || record.canonical_url !== pageUrl || record.external_id !== operation.externalId
      || to.nativeSource && (to.nativeSource.docsDir !== docsDir || to.nativeSource.relativePath !== relative)
      || semanticIdentity([title, authors.sourceAuthors ?? [], authors.primarySourceAuthorId ?? null, normalizedSourceDate(data.date), normalizedSourceDate(data.lastUpdated ?? data.updated_at), identity.coreTopicId ?? (record.existing_topic_id === operation.topicId ? operation.topicId : undefined) ?? null])
        !== semanticIdentity([record.title, record.source_authors ?? [], record.primary_source_author_id ?? null, record.source_created_at, record.source_updated_at, record.existing_topic_id ?? null])
      || capture && (capture.original !== body || capture.sourceArticleUrl !== sourcePreparationBase(operation, actual.contents, pageUrl))) throw new Error("Selected source changed from its refused article/identity; use the ordinary truthful edition path, not unchanged-source Retry.");
    if (record.expected_source_revision !== (to.acceptedRevision ?? null) || identity.existingResourceId !== operation.resourceId || identity.existingTopicId !== operation.topicId
      || operation.resourceId && data.discussionbridgeSourcePublicationRevision !== to.acceptedRevision || !operation.resourceId && to.acceptedRevision) throw new Error("Selected Retry native ownership/current predecessor requires reconciliation.");
    const client = new CmsClient({ serverUrl: options.discourseUrl, ...options.controlledCreation }), connection = await client.connection();
    assertLifecycleScope(options, operation, client, connection);
    if (operation.resourceId) {
      const current = await client.record(operation.resourceId);
      if (current.direction !== "to_discourse" || current.state !== "active" || current.resource_id !== operation.resourceId || current.topic_id !== operation.topicId
        || current.external_id !== operation.externalId || current.canonical_url !== pageUrl || current.source_revision !== to.acceptedRevision) throw new Error("Selected Retry requires its exact current scoped accepted predecessor/ownership.");
      assertCmsTopicUrl(current.topic_url, current.topic_id, client.origin);
    }
    const checked = await nativePublicationFiles.readExisting(file), checkedRoot = await lstat(docsDir, { bigint: true });
    if (!checked || checked.dev !== actual.dev || checked.ino !== actual.ino || checked.contents !== actual.contents || checkedRoot.dev !== root.dev || checkedRoot.ino !== root.ino) throw new Error("Selected Retry native source/root changed during current authority checks.");
    to.retryIntents ??= Object.create(null);
    to.retryIntents![refusedMutationId] = { refusedMutationId, refusedRequestSha256: pending.rejection.requestSha256, fingerprint: pending.fingerprint,
      expectedAcceptedRevision: to.acceptedRevision ?? null, requestedAt: new Date().toISOString(), native: { docsDir, relativePath: relative, contentSha256: sourceHash(actual.contents) }, phase: "armed" };
    await writePublicationOperationalState(stateFile, state);
    return { externalId: operation.externalId, refusedMutationId, phase: "armed", requestCreated: false, requiresNativeBuild: true };
  });
}

/** Protected actual native lifecycle/operator stop-delivery; no implicit resume. */
export async function withdrawControlledSource(options: PublishControlledDiscussionsOptions, sourceFile: string, reason: CmsToRevocationReason) {
  validateCms("RevocationReason", reason);
  const docsDir = path.resolve(options.docsDir), file = path.resolve(sourceFile), stateFile = path.resolve(options.stateFile), relativePath = path.relative(docsDir, file);
  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) throw new Error("Source lifecycle action requires the retained exact native content path.");
  return withNativeSourceWriter(docsDir, stateFile, async () => {
    const state = await readPublicationOperationalState(stateFile), client = new CmsClient({ serverUrl: options.discourseUrl, ...options.controlledCreation }), connection = await client.connection();
    return withdrawUnderNativeWriter(options, file, reason, state, client, connection);
  });
}

async function withdrawUnderNativeWriter(options: PublishControlledDiscussionsOptions, file: string, reason: CmsToRevocationReason, state: PublicationOperationalState, client: CmsClient, connection: CmsConnection) {
    const docsDir = path.resolve(options.docsDir), stateFile = path.resolve(options.stateFile), relativePath = path.relative(docsDir, file);
    const owners = Object.values(state.operations).filter(operation => operation.to?.nativeSource?.docsDir === docsDir && operation.to.nativeSource.relativePath === relativePath);
    if (owners.length !== 1) throw new Error("Source lifecycle requires one current accepted native identity; no reconstruction or initialization.");
    const operation = owners[0], to = operation.to!;
    if (!to.acceptedRevision || !to.acceptedResult || !operation.resourceId) throw new Error("Source lifecycle requires a known accepted native publication.");
    const capture = async () => {
      const actual = await captureLifecycleSource(options, operation, file);
      if (!actual) { if (reason !== "source_deleted") throw new Error("Native disappearance requires source_deleted."); return null; }
      if (reason === "source_deleted") throw new Error("Existing native source cannot be reported deleted.");
      const data = parseMarkdown(actual.contents).frontmatter;
      const lifecycle = nativeLifecycle(data);
      if (reason === "source_unpublished" && lifecycle !== "unpublished" || reason === "source_ineligible" && lifecycle !== "ineligible") throw new Error("Source lifecycle reason disagrees with actual native source.");
      // policy_excluded is this protected native operator's explicit stop intent.
      return actual.contents;
    };
    const captured = await capture(), native = { docsDir, relativePath, contentSha256: captured === null ? null : createHash("sha256").update(captured).digest("hex") };
    if (to.withdrawal && (semanticIdentity(to.withdrawal.native) !== semanticIdentity(native) || to.withdrawal.body.reason !== reason)) throw new Error("Pending lifecycle intent retains its original native capture/reason.");
    assertLifecycleScope(options, operation, client, connection);
    const assertRecord = (record: CmsToRecordMetadata, withdrawn: boolean) => {
      validateCms("Record", record);
      if (record.state !== (withdrawn ? "withdrawn" : "active") || record.direction !== "to_discourse" || record.resource_id !== operation.resourceId || record.topic_id !== operation.topicId
        || record.external_id !== operation.externalId || record.canonical_url !== operation.canonicalUrl || record.topic_url !== operation.topicUrl || record.source_revision !== to.acceptedRevision) throw new Error("Source lifecycle receipt requires exact current native/receiver binding.");
      if (to.withdrawal && semanticIdentity(record) !== semanticIdentity({ ...to.withdrawal.before, state: record.state })) throw new Error("Binding withdrawal must preserve native/topic/source metadata.");
    };
    const current = await client.record(operation.resourceId);
    if (!to.withdrawal) { assertRecord(current, false); to.withdrawal = { body: { mutation_id: randomUUID(), expected_source_revision: to.acceptedRevision, reason }, native, before: structuredClone(current), phase: "pending" }; await writePublicationOperationalState(stateFile, state); }
    else assertRecord(current, current.state === "withdrawn");
    if (!to.withdrawal.result) {
      if (await capture() !== captured) throw new Error("Native source changed after lifecycle capture.");
      const result = await client.withdrawRecord(operation.resourceId, to.withdrawal.body); assertRecord(result, true);
      to.withdrawal.result = structuredClone(result); await writePublicationOperationalState(stateFile, state);
    }
    const readback = await client.record(operation.resourceId); assertRecord(readback, true); to.withdrawal.current = readback; to.withdrawal.phase = "withdrawn"; operation.outcome = "withdrawn";
    await writePublicationOperationalState(stateFile, state); return structuredClone(to.withdrawal.result);
}

function assertLifecycleScope(options: PublishControlledDiscussionsOptions, operation: PublicationOperation, client: CmsClient, connection: CmsConnection) {
  const to = operation.to!;
  if (connection.connection_id !== to.scope.connectionId || connection.scope_revision !== to.scope.scopeRevision || client.origin !== to.scope.serverOrigin || connection.profile !== "astro"
    || !connection.directions.includes("to_discourse") || !sameCmsOrigin(options.siteUrl, to.scope.siteOrigin) || !sameCmsOrigin(connection.destination_origin, to.scope.siteOrigin) || (options.controlledCreation.lane ?? connection.publication_lane) !== to.scope.lane) throw new Error("Current source lifecycle scope requires reconciliation.");
}

async function captureLifecycleSource(options: PublishControlledDiscussionsOptions, operation: PublicationOperation, file: string) {
  await nativePublicationFiles.assertDirectory(path.dirname(file)); const actual = await nativePublicationFiles.readExisting(file);
  if (!actual) return null;
  const data = parseMarkdown(actual.contents).frontmatter;
  if (data.discussionbridgeExternalId !== operation.externalId || data.discussionbridgeResourceId !== operation.resourceId || nativeCoreId(data.discourseTopicId) !== operation.topicId
    || data.discourseTopicUrl !== operation.topicUrl || data.discussionbridgeSourcePublicationRevision !== operation.to!.acceptedRevision
    || pageUrlForFile({ docsDir: path.resolve(options.docsDir), filePath: file, siteBase: parseServiceBaseUrl(options.siteUrl), routeBase: validateRouteBase(options.routeBase), slug: data.slug, hasSlug: Object.hasOwn(data, "slug") }) !== operation.canonicalUrl) throw new Error("Current native lifecycle binding/revision requires reconciliation.");
  return actual;
}

function captureBinding(data: Record<string, unknown>, site: NativeUrl, docsDir: string, file: string, forumOrigin: string) {
  const present = ["discussionbridgeExternalId", "discussionbridgeResourceId", "discourseTopicId", "discourseTopicUrl"].map(key => Object.hasOwn(data, key));
  const complete = present.every(Boolean), none = present.every(value => !value), explicit = present[0] && !present[1] && !present[2] && !present[3], nativeCore = !present[0] && !present[1] && present[2] && present[3];
  if (!complete && !none && !explicit && !nativeCore) throw new Error("Native source identity tuple is partial or ambiguous.");
  const externalId = complete || explicit ? String(validateCms("OpaqueId", data.discussionbridgeExternalId)) : stableExternalId(site, docsDir, file);
  if (complete) { validateCms("UUID", data.discussionbridgeResourceId); const existingTopicId = nativeCoreId(data.discourseTopicId); assertCmsTopicUrl(String(data.discourseTopicUrl), existingTopicId, forumOrigin);
    return { externalId, existingResourceId: data.discussionbridgeResourceId as string, existingTopicId }; }
  if (nativeCore) { const coreTopicId = nativeCoreId(data.discourseTopicId); assertCmsTopicUrl(String(data.discourseTopicUrl), coreTopicId, forumOrigin); return { externalId, coreTopicId }; }
  return { externalId };
}
function nativeCoreId(value: unknown) { const exact = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value; validateCms("CoreId", exact); return exact as string; }
function normalizedSourceDate(value: unknown) { const time = sourceDate(value); return time === null ? null : new Date(time).toISOString(); }
function captureAuthors(value: unknown, primary: unknown): { sourceAuthors?: { id: string; name: string }[]; primarySourceAuthorId?: string } {
  if (value === undefined) { if (primary !== undefined) throw new Error("Native primary author requires actual source authors."); return {}; }
  const list = Array.isArray(value) ? value : [value];
  const authors = list.map(entry => { if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Native source author is invalid."); return { id: (entry as Record<string, string>).id, name: (entry as Record<string, string>).name }; });
  validateCms("SourceAuthors", authors); if (!authors.length) throw new Error("Native source authors cannot be empty when supplied.");
  const primarySourceAuthorId = primary === undefined ? authors[0].id : validateCms("OpaqueId", primary) as string;
  if (!authors.some(author => author.id === primarySourceAuthorId)) throw new Error("Native primary author must identify a supplied author.");
  return { sourceAuthors: authors, primarySourceAuthorId };
}
