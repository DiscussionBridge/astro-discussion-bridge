import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { lock } from "proper-lockfile";
import sanitizeHtml from "sanitize-html";
import { stringify as stringifyYaml } from "yaml";
import { PRODUCT_VERSION } from "./version.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REVISION = /^[a-f0-9]{64}$/u;
const LEASE = /^[a-f0-9]{64}$/u;
const CONNECTION = /^dbc_[a-f0-9]{24}$/u;

export interface AstroPublicationWorkOptions {
  docsDir: string;
  stateFile: string;
  siteUrl: string;
  serverUrl: string;
  connectionId: string;
  connectionSecret: string;
  lane?: string;
  routeBase?: string;
  sections?: AstroPublicationSection[];
  maximum?: number;
  requestDelayMs?: number;
  fetchImplementation?: typeof fetch;
}

export interface AstroPublicationSection {
  id: string;
  label: string;
  path: string;
}

interface PublicationState {
  topic_id: number;
  resource_id: string;
  external_id: string;
  canonical_url: string;
  file: string;
  source_revision?: string;
  publication_revision: string;
  mapping_revision?: string;
  destination?: Record<string, unknown>;
  outcome: "created" | "updated" | "unchanged" | "unpublished";
  state: "pending_publish" | "pending_unpublish" | "healthy" | "unpublished" | "attention";
  written_sha256?: string;
  lease_token?: string;
  lease_expires_at?: string;
}

interface OperationalState {
  schema_version: 1;
  publications: Record<string, PublicationState>;
}

export function astroPlatformCatalog(rawSections: AstroPublicationSection[] = []) {
  const sections = publicationSections(rawSections);
  return {
    schema_version: 1,
    platform: "astro",
    containers: [{ id: "topics", label: "Topics", kind: "collection", path: "/topics/", taxonomy_ids: sections.length ? ["section"] : [] }],
    taxonomies: sections.length ? [{
      id: "section",
      label: "Sections",
      kind: "taxonomy",
      terms: sections.map(({ id, label }) => ({ id, label, kind: "term" })),
    }] : [],
    authors: [{ id: "astro:build", label: "Astro build service", kind: "author" }],
    service_author_id: "astro:build",
    presentation_modes: ["simple", "full", "fullInteractive", "native"],
    capabilities: { updates: true, unpublish: true, drafts: true },
    limits: { content_bytes: 49_152, title_bytes: 255, slug_bytes: 160 },
    inventory: { authors_complete: true, terms_complete: true, authors_observed: 1, terms_observed: sections.length },
  };
}

class BridgeClient {
  private nextRequestAt = 0;

  constructor(private options: AstroPublicationWorkOptions, private fetchImplementation: typeof fetch) {}

  platformCatalogStatus() { return this.request("GET", "/discussion-bridge/v1/platform-catalog.json", undefined, 1024 * 1024); }
  updatePlatformCatalog(catalog: unknown, expected?: string) {
    return this.request("PUT", "/discussion-bridge/v1/platform-catalog.json", { catalog, ...(expected ? { expected_catalog_revision: expected } : {}) }, 1024 * 1024);
  }
  claimPublicationWork() { return this.request("POST", "/discussion-bridge/v1/publication-work/claim.json", { lease_seconds: 3600 }); }
  sourceTopic(topicId: number) { return this.request("GET", `/discussion-bridge/v1/source-topics/${topicId}.json`, undefined, 384 * 1024); }
  sourceRevocation(resourceId: string) { return this.request("GET", `/discussion-bridge/v1/source-revocations/${encodeURIComponent(resourceId)}.json`, undefined, 384 * 1024); }
  resolveSourceTopic(topicId: number, publication: unknown) { return this.request("POST", `/discussion-bridge/v1/source-topics/${topicId}/resolve.json`, { publication }); }
  acknowledge(resourceId: string, acknowledgement: unknown) { return this.request("PUT", `/discussion-bridge/v1/bridge-records/${encodeURIComponent(resourceId)}/acknowledgement.json`, { acknowledgement }); }
  fail(token: string, code: string, detail: string) {
    return this.request("PUT", "/discussion-bridge/v1/publication-work/failure.json", { publication_work_failure: { lease_token: token, error_code: code, error_detail: detail } });
  }

  private async request(method: string, pathname: string, payload?: unknown, maximum = 256 * 1024): Promise<Record<string, any>> {
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    if (body && Buffer.byteLength(body) > 256 * 1024) throw new Error("DiscussionBridge request is too large");
    const delay = this.options.requestDelayMs ?? 0;
    const waitFor = Math.max(0, this.nextRequestAt - Date.now());
    if (waitFor) await wait(waitFor);
    this.nextRequestAt = Date.now() + delay;
    const response = await this.fetchImplementation(`${origin(this.options.serverUrl, "server")}${pathname}`, {
      method,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        "X-DiscussionBridge-Connection": this.options.connectionId,
        "X-DiscussionBridge-Secret": this.options.connectionSecret,
        "X-DiscussionBridge-Adapter": "astro-discussion-bridge",
        "X-DiscussionBridge-Adapter-Version": PRODUCT_VERSION,
      },
    });
    if (response.url && new URL(response.url).origin !== origin(this.options.serverUrl, "server")) throw new Error("DiscussionBridge response changed origin");
    if (!(response.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new Error("DiscussionBridge response is not JSON");
    const declared = response.headers.get("content-length");
    if (declared && (!/^\d+$/u.test(declared) || Number(declared) > maximum)) throw new Error("DiscussionBridge response is too large");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximum) throw new Error("DiscussionBridge response is too large");
    let value: unknown;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw new Error("DiscussionBridge response JSON is invalid"); }
    if (!response.ok || !value || typeof value !== "object" || Array.isArray(value)) throw new Error("DiscussionBridge request failed");
    return value as Record<string, any>;
  }
}

export async function prepareAstroPublicationWork(options: AstroPublicationWorkOptions) {
  validateOptions(options);
  const maximum = options.maximum ?? 20;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 200) throw new Error("Invalid publication work limit");
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const bridge = new BridgeClient(options, fetchImplementation);
  const current = await bridge.platformCatalogStatus();
  const catalog = await bridge.updatePlatformCatalog(astroPlatformCatalog(options.sections), REVISION.test(String(current.catalog_revision ?? "")) ? current.catalog_revision : undefined);
  if (catalog.destination_mapping_state !== "current") throw new Error("Astro destination mapping requires operator configuration");
  return withState(options.stateFile, async (state) => {
    const summary = { claimed: 0, created: 0, updated: 0, unchanged: 0, unpublished: 0, failed: 0, errors: [] as Array<Record<string, unknown>>, requires_build: false, requires_finalize: false };
    let pending = 0;
    for (const item of Object.values(state.publications)) {
      if (!item.state.startsWith("pending_") || !item.lease_token) continue;
      if (Date.parse(item.lease_expires_at ?? "") > Date.now()) pending++;
      else { item.state = "attention"; delete item.lease_token; delete item.lease_expires_at; }
    }
    summary.requires_finalize = pending > 0;
    for (let index = pending; index < maximum; index++) {
      const response = await bridge.claimPublicationWork();
      const work = validateWork(response.publication_work);
      if (!work) break;
      summary.claimed++;
      try {
        if (work.action === "publish") {
          const responseTopic = await bridge.sourceTopic(work.topic_id);
          const source = responseTopic.eligible === true ? responseTopic.source_topic : null;
          if (!source || source.source_revision !== work.source_revision || source.publication_revision !== work.publication_revision) throw new Error("Claimed Astro source revision changed");
          const prepared = await preparePublication(options, bridge, state, source, work);
          summary[prepared.outcome]++;
          summary.requires_build ||= prepared.changed;
        } else {
          await prepareUnpublish(options, bridge, state, work);
          summary.unpublished++;
          summary.requires_build = true;
        }
        summary.requires_finalize = true;
        await atomicWrite(options.stateFile, `${JSON.stringify(state, null, 2)}\n`);
      } catch (error) {
        const detail = boundedError(error);
        try { await bridge.fail(work.lease_token, failureCode(error), detail); }
        catch (reportError) { summary.errors.push({ topic_id: work.topic_id, reason: boundedError(reportError) }); }
        summary.failed++;
        summary.errors.push({ topic_id: work.topic_id, reason: detail });
      }
    }
    return summary;
  });
}

export async function finalizeAstroPublicationWork(options: AstroPublicationWorkOptions) {
  validateOptions(options);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const bridge = new BridgeClient(options, fetchImplementation);
  return withState(options.stateFile, async (state) => {
    const summary = { acknowledged: 0, unchanged: 0, failed: 0, errors: [] as Array<Record<string, unknown>> };
    for (const publication of Object.values(state.publications)) {
      if (!publication.state.startsWith("pending_")) continue;
      try {
        if (!LEASE.test(publication.lease_token ?? "") || Date.parse(publication.lease_expires_at ?? "") <= Date.now()) throw new Error("Astro publication lease expired before finalize");
        if (publication.state === "pending_publish") await verifyPublic(publication, fetchImplementation);
        else await verifyAbsent(publication.canonical_url, fetchImplementation);
        const acknowledgement: Record<string, unknown> = {
          lease_token: publication.lease_token,
          publication_revision: publication.publication_revision,
          native_destination: { external_id: publication.external_id, canonical_url: publication.canonical_url },
          outcome: publication.state === "pending_unpublish" ? "unpublished" : publication.outcome,
        };
        if (publication.state === "pending_publish") Object.assign(acknowledgement, {
          source_revision: publication.source_revision,
          mapping_revision: publication.mapping_revision,
          destination: publication.destination,
        });
        const response = await bridge.acknowledge(publication.resource_id, acknowledgement);
        if (!UUID.test(String(response.resource_id ?? ""))) throw new Error("Astro acknowledgement is invalid");
        publication.state = publication.state === "pending_unpublish" ? "unpublished" : "healthy";
        delete publication.lease_token;
        delete publication.lease_expires_at;
        summary.acknowledged++;
      } catch (error) {
        summary.failed++;
        summary.errors.push({ topic_id: publication.topic_id, reason: boundedError(error) });
      }
    }
    return summary;
  });
}

async function preparePublication(options: AstroPublicationWorkOptions, bridge: BridgeClient, state: OperationalState, source: Record<string, any>, work: Record<string, any>) {
  const plan = publicationPlan(options, source);
  const resolved = await bridge.resolveSourceTopic(plan.topicId, {
    source_revision: plan.sourceRevision,
    publication_revision: plan.publicationRevision,
    mapping_revision: plan.mappingRevision,
    destination: plan.destination,
    external_id: plan.externalId,
    canonical_url: plan.canonicalUrl,
    ...(options.lane ? { lane: options.lane } : {}),
    native_materialization: true,
  });
  if (!UUID.test(String(resolved.resource_id ?? "")) || !["created", "resolved"].includes(resolved.outcome) || resolved.external_id !== plan.externalId || resolved.canonical_url !== plan.canonicalUrl) throw new Error("Invalid Astro resolve response");
  const resourceId = String(resolved.resource_id).toLowerCase();
  const file = path.resolve(options.docsDir, `${plan.route}.md`);
  const root = path.resolve(options.docsDir);
  if (!file.startsWith(`${root}${path.sep}`)) throw new Error("Astro publication path escaped content root");
  const previous = state.publications[String(plan.topicId)];
  let prior: string | undefined;
  try { prior = await readFile(file, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (previous?.written_sha256 && prior && sha256(prior) !== previous.written_sha256) throw new Error("Astro native publication changed outside DiscussionBridge");
  if (previous && previous.resource_id !== resourceId) throw new Error("Astro publication resource identity changed");
  const output = nativeContent(plan, resourceId);
  const receiverCurrent = source.publication?.destination_state === "healthy" && source.publication?.acknowledged_publication_revision === plan.publicationRevision;
  const outcome: "created" | "updated" | "unchanged" = prior === undefined
    ? "created"
    : prior === output && receiverCurrent ? "unchanged" : "updated";
  if (prior !== output) await atomicWrite(file, output);
  state.publications[String(plan.topicId)] = {
    topic_id: plan.topicId,
    resource_id: resourceId,
    external_id: plan.externalId,
    canonical_url: plan.canonicalUrl,
    file: path.relative(root, file),
    source_revision: plan.sourceRevision,
    publication_revision: plan.publicationRevision,
    mapping_revision: plan.mappingRevision,
    destination: plan.destination,
    outcome,
    state: "pending_publish",
    written_sha256: sha256(output),
    lease_token: work.lease_token,
    lease_expires_at: work.lease_expires_at,
  };
  return { outcome, changed: prior !== output };
}

async function prepareUnpublish(options: AstroPublicationWorkOptions, bridge: BridgeClient, state: OperationalState, work: Record<string, any>) {
  const response = await bridge.sourceRevocation(work.resource_id);
  const revocation = response.revoked === true ? response.publication_revocation : null;
  if (!revocation || revocation.topic_id !== work.topic_id || revocation.publication_revision !== work.publication_revision) throw new Error("Claimed Astro withdrawal changed");
  const local = state.publications[String(work.topic_id)];
  if (!local || local.resource_id !== work.resource_id) throw new Error("Astro publication for withdrawal is unavailable");
  const file = path.resolve(options.docsDir, local.file);
  if (local.written_sha256) {
    const prior = await readFile(file, "utf8");
    if (sha256(prior) !== local.written_sha256) throw new Error("Astro native publication changed outside DiscussionBridge");
  }
  await rm(file, { force: true });
  Object.assign(local, {
    publication_revision: work.publication_revision,
    outcome: "unpublished",
    state: "pending_unpublish",
    lease_token: work.lease_token,
    lease_expires_at: work.lease_expires_at,
  });
}

function publicationPlan(options: AstroPublicationWorkOptions, source: Record<string, any>) {
  if (!Number.isSafeInteger(source.topic_id) || source.topic_id < 1 || !REVISION.test(source.publication_revision ?? "") || typeof source.source_revision !== "string") throw new Error("Invalid Astro source identity");
  const destination = source.destination;
  if (!destination || destination.state !== "ready" || destination.destination_container_id !== "topics" || destination.destination_author_id !== "astro:build" || !REVISION.test(destination.mapping_revision ?? "")) throw new Error("Astro destination is not ready");
  const terms = Array.isArray(destination.destination_terms) ? destination.destination_terms : [];
  if (terms.length > 1) throw new Error("Astro destination has multiple native sections");
  const section = terms.length ? publicationSections(options.sections ?? []).find(({ id }) =>
    terms[0]?.destination_taxonomy_id === "section" && terms[0]?.destination_term_id === id
  ) : undefined;
  if (terms.length && !section) throw new Error("Astro destination section is invalid");
  const site = origin(options.siteUrl, "site");
  const title = bounded(source.title, 255, "source title");
  const routeBase = (options.routeBase ?? "topics").replace(/^\/+|\/+$/gu, "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(routeBase)) throw new Error("Invalid Astro route base");
  const priorUrl = source.publication?.canonical_url;
  const route = priorUrl ? publicationRoute(priorUrl, site, routeBase) : `${routeBase}/${slug(title, source.topic_id)}`;
  const canonicalUrl = `${site}/${route}/`;
  const html = sanitizeHtml(boundedContent(source.content_html, 49_152, "source content"), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2", "h3", "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td"]),
    allowedAttributes: { a: ["href", "title", "rel"], img: ["src", "alt", "title", "width", "height"], code: ["class"], pre: ["class"], div: ["class"], span: ["class"] },
    allowedSchemes: ["https"], allowProtocolRelative: false,
  });
  if (!html.trim()) throw new Error("Astro source content sanitized to empty");
  const createdAt = isoDate(source.source_created_at, "creation");
  const updatedAt = isoDate(source.source_updated_at, "update");
  if (Date.parse(updatedAt) < Date.parse(createdAt)) throw new Error("Source update precedes creation");
  return {
    topicId: source.topic_id as number,
    title,
    html,
    createdAt,
    updatedAt,
    sourceRevision: source.source_revision as string,
    publicationRevision: source.publication_revision as string,
    mappingRevision: destination.mapping_revision as string,
    destination: destination as Record<string, unknown>,
    author: bounded(source.author?.name, 200, "source author"),
    topicUrl: exactSourceUrl(source.topic_url, origin(options.serverUrl, "server")),
    route,
    canonicalUrl,
    externalId: `astro:topic:${source.topic_id}`,
    section,
  };
}

function nativeContent(plan: ReturnType<typeof publicationPlan>, resourceId: string) {
  const frontmatter = {
    title: plan.title,
    description: `Published from The Bridge by ${plan.author}.`,
    date: plan.createdAt,
    lastUpdated: plan.updatedAt,
    discussionCommentsDisplay: "interactive",
    discussionSync: false,
    discussionFromDiscourse: true,
    discussionbridgeNativePublication: true,
    discussionbridgeResourceId: resourceId,
    discourseTopicId: plan.topicId,
    discourseTopicUrl: plan.topicUrl,
    discussionbridgeSourceRevision: plan.sourceRevision,
    discussionbridgePublicationRevision: plan.publicationRevision,
    ...(plan.section ? { discussionbridgeSection: plan.section.id } : {}),
  };
  const yaml = stringifyYaml(frontmatter).trim().replace(/^(date|lastUpdated): ([^\r\n]+)$/gmu, '$1: "$2"');
  return `---\n${yaml}\n---\n\n<span hidden data-discussionbridge-resource-id="${resourceId}" data-discussionbridge-publication-revision="${plan.publicationRevision}"></span>\n\n${plan.html}\n\n<hr>\n\n**Published from [The Bridge](${plan.topicUrl})**<br>\nSource author: ${plan.author} · Revision ${plan.sourceRevision} · DiscussionBridge for Astro ${PRODUCT_VERSION}\n`;
}

async function verifyPublic(publication: PublicationState, fetchImplementation: typeof fetch) {
  const response = await fetchImplementation(publication.canonical_url, { redirect: "error", headers: { Accept: "text/html" }, signal: AbortSignal.timeout(15_000) });
  if (response.url && response.url !== publication.canonical_url) throw new Error("Astro publication changed public URL");
  if (!response.ok || !(response.headers.get("content-type") ?? "").toLowerCase().startsWith("text/html")) throw new Error("Astro publication is not public");
  const body = await boundedBody(response, 512 * 1024);
  if (!body.includes(`data-discussionbridge-resource-id=\"${publication.resource_id}\"`) || !body.includes(`data-discussionbridge-publication-revision=\"${publication.publication_revision}\"`)) throw new Error("Astro public publication identity is stale");
}

async function verifyAbsent(url: string, fetchImplementation: typeof fetch) {
  const response = await fetchImplementation(url, { redirect: "error", headers: { Accept: "text/html" }, signal: AbortSignal.timeout(15_000) });
  if (response.status !== 404 && response.status !== 410) throw new Error("Astro unpublished page remains public");
}

async function boundedBody(response: Response, maximum: number) {
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/u.test(declared) || Number(declared) > maximum)) throw new Error("Astro public response is too large");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximum) throw new Error("Astro public response is too large");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function validateOptions(options: AstroPublicationWorkOptions) {
  origin(options.siteUrl, "site"); origin(options.serverUrl, "server");
  if (!CONNECTION.test(options.connectionId) || Buffer.byteLength(options.connectionSecret) < 32 || Buffer.byteLength(options.connectionSecret) > 256 || /[\u0000-\u001f\u007f]/u.test(options.connectionSecret)) throw new Error("Invalid DiscussionBridge credentials");
  if (options.requestDelayMs !== undefined && (!Number.isSafeInteger(options.requestDelayMs) || options.requestDelayMs < 0 || options.requestDelayMs > 5000)) throw new Error("Invalid DiscussionBridge request delay");
}

function validateWork(value: unknown): Record<string, any> | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid publication work claim");
  const work = value as Record<string, any>;
  if (!Number.isSafeInteger(work.topic_id) || work.topic_id < 1 || !["publish", "unpublish"].includes(work.action) || !LEASE.test(work.lease_token ?? "") || !REVISION.test(work.publication_revision ?? "") || !Number.isFinite(Date.parse(work.lease_expires_at ?? ""))) throw new Error("Invalid publication work claim");
  if (work.action === "unpublish" && !UUID.test(work.resource_id ?? "")) throw new Error("Invalid publication withdrawal claim");
  return work;
}

async function withState<T>(file: string, action: (state: OperationalState) => Promise<T>) {
  await mkdir(path.dirname(file), { recursive: true });
  try { await open(file, "wx").then((handle) => handle.close()); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const release = await lock(file, { realpath: false, retries: 0, stale: 15 * 60 * 1000, update: 5000 });
  try {
    let state: OperationalState;
    const raw = await readFile(file, "utf8");
    if (!raw.trim()) state = { schema_version: 1, publications: {} };
    else {
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value) || (value as any).schema_version !== 1 || typeof (value as any).publications !== "object") throw new Error("Astro publication-work state is invalid");
      state = value as OperationalState;
    }
    const result = await action(state);
    await atomicWrite(file, `${JSON.stringify(state, null, 2)}\n`);
    return result;
  } finally { await release(); }
}

async function atomicWrite(file: string, value: string) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, "wx");
    try { await handle.writeFile(value, "utf8"); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, file);
  } catch (error) { await rm(temporary, { force: true }); throw error; }
}

function origin(value: string, label: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error(`Invalid Astro ${label} origin`);
  return url.origin;
}
function bounded(value: unknown, maximum: number, label: string) { if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value) > maximum || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`Invalid Astro ${label}`); return value.trim(); }
function boundedContent(value: unknown, maximum: number, label: string) { if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value) > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) throw new Error(`Invalid Astro ${label}`); return value.trim(); }
function isoDate(value: unknown, label: string) { const result = bounded(value, 64, `${label} time`); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(result) || !Number.isFinite(Date.parse(result))) throw new Error(`Invalid Astro ${label} time`); return result; }
function slug(value: string, topicId: number) { const result = value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 140); return `${result || "forum-topic"}-${topicId}`; }
function publicationRoute(value: unknown, site: string, routeBase: string) { const url = new URL(bounded(value, 2048, "publication URL")); if (url.origin !== site || url.search || url.hash || !url.pathname.startsWith(`/${routeBase}/`) || !url.pathname.endsWith("/")) throw new Error("Astro publication URL changed or is invalid"); return url.pathname.slice(1, -1); }
function exactSourceUrl(value: unknown, server: string) { const url = new URL(bounded(value, 2048, "source topic URL")); if (url.origin !== server || url.search || url.hash) throw new Error("Invalid Astro source topic URL"); return url.href; }
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
function publicationSections(raw: AstroPublicationSection[]) {
  if (!Array.isArray(raw) || raw.length > 100) throw new Error("Invalid Astro native section inventory");
  const sections = raw.map((item) => {
    const id = bounded(item?.id, 100, "section id");
    const label = bounded(item?.label, 255, "section label");
    const sectionPath = bounded(item?.path, 255, "section path");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id) || sectionPath !== `/sections/${id}/`) throw new Error("Invalid Astro native section");
    return { id, label, path: sectionPath };
  });
  if (new Set(sections.map(({ id }) => id)).size !== sections.length) throw new Error("Duplicate Astro native section");
  return sections;
}
function boundedError(error: unknown) { return String((error as Error)?.message ?? error).replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, 1000); }
function failureCode(error: unknown) { return boundedError(error).toLowerCase().replace(/[^a-z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 64) || "astro_publication_failed"; }
