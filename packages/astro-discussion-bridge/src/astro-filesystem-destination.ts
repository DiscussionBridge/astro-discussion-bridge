import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { lock } from "proper-lockfile";
import { stringify as stringifyYaml } from "yaml";
import type { AstroPublicationDestination, PreparedAstroPublication } from "./publication-worker.js";
import type { AstroDestinationBinding, AstroPublicationWork } from "./publication-work.js";

const STATE_VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAXIMUM_CENSUS_FILES = 100_000;
const MAXIMUM_NATIVE_FILE_BYTES = 20 * 1024 * 1024;
const MAXIMUM_STATE_BYTES = 128 * 1024 * 1024;
const MAXIMUM_JOURNAL_BYTES = 64 * 1024;

export interface AstroFilesystemDestinationOptions {
  docsDir: string;
  stateFile: string;
  siteUrl: string;
  routeBase?: string;
  forumName?: string;
  deploy: AstroPublicationDestination["deploy"];
  verify: AstroPublicationDestination["verify"];
  now?: () => Date;
}

interface NativePublicationState {
  bindingId: string;
  externalId: string;
  canonicalUrl: string;
  relativeFile: string;
  publicationRevision: string;
  contentDisposition: "complete" | "excerpt";
  sourceRevision: string;
  sourceRevisionSequence: number;
  contentSha256: string;
  status: "published" | "held" | "unpublished";
}

interface FilesystemState {
  schemaVersion: 1;
  adapterId: "astro-discussion-bridge";
  publications: Record<string, NativePublicationState>;
}

interface MutationJournal {
  schemaVersion: 1;
  resourceId: string;
  workId: string;
  action: AstroPublicationWork["action"];
  relativeFile: string;
  expectedContentSha256: string | null;
  nextState: NativePublicationState;
}

interface ValidatedOptions extends Omit<AstroFilesystemDestinationOptions, "routeBase" | "forumName" | "now"> {
  site: URL;
  routeSegments: string[];
  forumName: string;
  now: () => Date;
}

export function createAstroFilesystemDestination(options: AstroFilesystemDestinationOptions): AstroPublicationDestination {
  const configuration = validateConfiguration(options);
  return {
    synchronize: async ({ work, publication }) => synchronizeFilesystemPublication(configuration, work, publication),
    deploy: options.deploy,
    verify: options.verify,
  };
}

async function synchronizeFilesystemPublication(
  options: ValidatedOptions,
  work: AstroPublicationWork,
  publication: PreparedAstroPublication,
): Promise<{ destinationBinding: AstroDestinationBinding; synchronizedAt: string }> {
  return withStateLock(options.stateFile, async () => {
    await assertSafeDirectory(options.docsDir);
    const state = await readState(options.stateFile);
    const census = await nativeIdentityCensus(options.docsDir);
    const recovered = await recoverJournalIfPossible(options, state, work, publication);
    if (recovered) return { destinationBinding: binding(recovered), synchronizedAt: options.now().toISOString() };
    const prior = state.publications[work.resourceId];
    validateExistingIdentity(options, work, prior, census);
    validateTransition(work, prior);

    const identity = prior ?? createIdentity(options, work, publication);
    const absoluteFile = containedFile(options.docsDir, identity.relativeFile);
    const removesPublicFile = work.action === "hold" || work.action === "unpublish";
    const output = removesPublicFile ? null : renderNativePublication(options, work, publication, identity.externalId);
    const contentSha256 = output === null ? "" : sha256(output);
    const nextState: NativePublicationState = {
      ...identity,
      publicationRevision: publicationRevision(work, publication, contentSha256),
      contentDisposition: publication.contentDisposition,
      sourceRevision: work.sourceRevision,
      sourceRevisionSequence: work.sourceRevisionSequence,
      contentSha256,
      status: work.action === "hold" ? "held" : work.action === "unpublish" ? "unpublished" : "published",
    };
    const journal: MutationJournal = {
      schemaVersion: STATE_VERSION,
      resourceId: work.resourceId,
      workId: work.workId,
      action: work.action,
      relativeFile: identity.relativeFile,
      expectedContentSha256: output === null ? null : contentSha256,
      nextState,
    };
    await writeJsonAtomic(journalFile(options.stateFile), journal);

    if (output === null) await removeOwnedPublication(absoluteFile, work.resourceId, prior);
    else await writeOwnedPublication(absoluteFile, output, work.resourceId, prior);
    state.publications[work.resourceId] = nextState;
    await writeJsonAtomic(options.stateFile, state);
    await fs.rm(journalFile(options.stateFile), { force: true });
    return { destinationBinding: binding(nextState), synchronizedAt: options.now().toISOString() };
  });
}

function validateConfiguration(options: AstroFilesystemDestinationOptions): ValidatedOptions {
  if (!path.isAbsolute(options.docsDir) || !path.isAbsolute(options.stateFile)) throw new Error("Astro destination paths must be absolute.");
  const site = new URL(options.siteUrl);
  if (site.protocol !== "https:" || site.username || site.password || site.search || site.hash || !site.pathname.endsWith("/")) throw new Error("Astro site URL must be an exact HTTPS directory URL.");
  const routeSegments = (options.routeBase ?? "topics").split("/");
  if (!routeSegments.length || routeSegments.some((segment) => !SAFE_SEGMENT.test(segment))) throw new Error("Astro routeBase is invalid.");
  const forumName = boundedPlainText(options.forumName ?? process.env.DISCUSSIONBRIDGE_FORUM_NAME, 200, "forum name");
  return { ...options, forumName, site, routeSegments, now: options.now ?? (() => new Date()) };
}

function createIdentity(options: ValidatedOptions, work: AstroPublicationWork, publication: PreparedAstroPublication): NativePublicationState {
  const slug = `${slugify(publication.source.title)}-${publication.source.topicId}`;
  const relativeFile = path.posix.join(...options.routeSegments, `${slug}.md`);
  const canonicalUrl = new URL(`${path.posix.join(...options.routeSegments, slug)}/`, options.site).href;
  const seed = `${work.connectionId}\n${work.destinationPolicyId}\n${work.resourceId}`;
  return {
    bindingId: `dbb_${sha256(`binding\n${seed}`).slice(0, 32)}`,
    externalId: `astro:page:${sha256(`external\n${seed}`).slice(0, 32)}`,
    canonicalUrl,
    relativeFile,
    publicationRevision: "",
    contentDisposition: publication.contentDisposition,
    sourceRevision: work.sourceRevision,
    sourceRevisionSequence: work.sourceRevisionSequence,
    contentSha256: "",
    status: "published",
  };
}

function validateExistingIdentity(options: ValidatedOptions, work: AstroPublicationWork, prior: NativePublicationState | undefined, census: Map<string, string>): void {
  const censusFile = census.get(work.resourceId);
  if (!prior) {
    if (censusFile) throw new Error("Astro native identity exists without protected destination state; reconciliation is required.");
    return;
  }
  const expected = containedFile(options.docsDir, prior.relativeFile);
  if (censusFile && path.resolve(censusFile) !== expected) throw new Error("Astro native identity moved without an approved URL migration.");
  const canonical = new URL(prior.canonicalUrl);
  if (canonical.origin !== options.site.origin || !canonical.pathname.startsWith(options.site.pathname)) throw new Error("Astro protected destination state has escaped the configured site.");
}

function validateTransition(work: AstroPublicationWork, prior: NativePublicationState | undefined): void {
  if (!prior) {
    if (work.action !== "publish") throw new Error(`Astro ${work.action} requires an existing protected publication identity.`);
    return;
  }
  if (work.sourceRevisionSequence < prior.sourceRevisionSequence) throw new Error("Astro publication source revision regressed.");
  if (work.sourceRevisionSequence === prior.sourceRevisionSequence && work.sourceRevision !== prior.sourceRevision) throw new Error("Astro publication source revision conflicts with its persisted sequence.");
  const allowed = work.action === "publish"
    ? prior.status === "published"
    : work.action === "update"
      ? prior.status === "published"
      : work.action === "hold"
        ? prior.status === "published" || prior.status === "held"
        : work.action === "unpublish"
          ? true
          : prior.status === "held" || prior.status === "unpublished";
  if (!allowed) throw new Error(`Astro ${work.action} is invalid from ${prior.status} state.`);
}

function renderNativePublication(options: ValidatedOptions, work: AstroPublicationWork, publication: PreparedAstroPublication, externalId: string): string {
  const source = publication.source;
  const authorNames = source.sourceAuthors.map((author) => plainValue(author, ["display_name", "name", "username"])).filter((value): value is string => value !== null).slice(0, 20);
  const frontmatter = {
    title: source.title,
    description: `Published with DiscussionBridge from ${options.forumName}.`,
    pubDate: source.sourceCreatedAt,
    updatedDate: source.sourceUpdatedAt,
    discussionCommentsDisplay: work.presentationMode,
    discussionSync: false,
    discussionFromDiscourse: true,
    discussionbridgeNativePublication: true,
    discussionbridgeResourceId: work.resourceId,
    discussionbridgeExternalId: externalId,
    discussionbridgeSourceRevision: work.sourceRevision,
    discussionbridgeSourceRevisionSequence: work.sourceRevisionSequence,
    discussionbridgeContentDisposition: publication.contentDisposition,
    discourseTopicId: source.topicId,
    discourseTopicUrl: source.topicUrl,
    sourceAuthors: authorNames,
    discussionbridgeResolvedTaxonomy: work.resolvedTaxonomy.map((mapping) => mapping.destinationId),
    discussionbridgeResolvedAuthor: work.resolvedAuthor.destinationId,
  };
  const yaml = stringifyYaml(frontmatter).trim();
  const attribution = `**Published with [DiscussionBridge](https://discussionbridge.dev/) from [${escapeMarkdown(options.forumName)}](${source.topicUrl})**`;
  const author = authorNames.length ? escapeMarkdown(authorNames.join(", ")) : "Source forum author";
  return `---\n${yaml}\n---\n\n<div class="discussionbridge-published-content" data-discussionbridge-resource-id="${work.resourceId}" data-discussionbridge-source-revision="${escapeAttribute(work.sourceRevision)}">\n${publication.contentHtml}\n</div>\n\n<hr>\n\n${attribution}<br>\nSource author: ${author} · Revision ${escapeMarkdown(work.sourceRevision)}\n`;
}

async function nativeIdentityCensus(docsDir: string): Promise<Map<string, string>> {
  const identities = new Map<string, string>();
  const pending = [docsDir];
  let inspected = 0;
  while (pending.length) {
    const directory = pending.pop()!;
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Astro content contains a symbolic link; native identity cannot be checked safely.");
      if (entry.isDirectory()) { pending.push(candidate); continue; }
      if (!entry.isFile() || !/\.(?:md|mdx)$/i.test(entry.name)) continue;
      if (++inspected > MAXIMUM_CENSUS_FILES) throw new Error("Astro content exceeds the bounded native identity census.");
      const raw = await readPrefix(candidate, 128 * 1024);
      if (!/^discussionbridgeNativePublication:\s*true\s*$/mu.test(raw)) continue;
      const match = raw.match(/^discussionbridgeResourceId:\s*["']?([0-9a-f-]{36})["']?\s*$/imu);
      if (!match || !UUID.test(match[1])) throw new Error("Astro native publication identity is missing or invalid.");
      const resourceId = match[1].toLowerCase();
      if (identities.has(resourceId)) throw new Error("Astro native publication identity is duplicated across files.");
      identities.set(resourceId, path.resolve(candidate));
    }
  }
  return identities;
}

async function recoverJournalIfPossible(options: ValidatedOptions, state: FilesystemState, work: AstroPublicationWork, publication: PreparedAstroPublication): Promise<NativePublicationState | null> {
  const file = journalFile(options.stateFile);
  let journal: MutationJournal;
  try { journal = validateJournal(JSON.parse(await readProtectedFile(file, MAXIMUM_JOURNAL_BYTES))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  if (journal.workId !== work.workId || journal.resourceId !== work.resourceId || journal.action !== work.action) throw new Error("A different Astro native mutation requires recovery first.");
  const absoluteFile = containedFile(options.docsDir, journal.relativeFile);
  const expectedOutput = journal.expectedContentSha256 === null ? null : renderNativePublication(options, work, publication, journal.nextState.externalId);
  if (expectedOutput !== null && sha256(expectedOutput) !== journal.expectedContentSha256) throw new Error("Astro native mutation journal no longer matches source input.");
  if (expectedOutput === null) await removeOwnedPublication(absoluteFile, work.resourceId, state.publications[work.resourceId]);
  else await writeOwnedPublication(absoluteFile, expectedOutput, work.resourceId, state.publications[work.resourceId]);
  state.publications[work.resourceId] = journal.nextState;
  await writeJsonAtomic(options.stateFile, state);
  await fs.rm(file, { force: true });
  return journal.nextState;
}

async function writeOwnedPublication(file: string, output: string, resourceId: string, prior?: NativePublicationState): Promise<void> {
  const existing = await readFileIfPresent(file);
  if (existing !== null) {
    if (!hasResourceIdentity(existing, resourceId)) throw new Error("Astro publication destination is owned by different content.");
    if (prior?.contentSha256 && sha256(existing) !== prior.contentSha256 && existing !== output) throw new Error("Astro owned publication changed outside DiscussionBridge; reconciliation is required.");
    if (existing === output) return;
  }
  await atomicWrite(file, output, 0o644);
}

async function removeOwnedPublication(file: string, resourceId: string, prior?: NativePublicationState): Promise<void> {
  const existing = await readFileIfPresent(file);
  if (existing === null) return;
  if (!prior || !hasResourceIdentity(existing, resourceId) || sha256(existing) !== prior.contentSha256) throw new Error("Astro publication cannot remove content without exact ownership.");
  await fs.rm(file);
  await syncDirectory(path.dirname(file));
}

function publicationRevision(work: AstroPublicationWork, publication: PreparedAstroPublication, contentSha256: string): string {
  return `astro:sha256:${sha256([work.resourceId, work.sourceRevision, String(work.sourceRevisionSequence), work.action, publication.contentDisposition, contentSha256].join("\n"))}`;
}

function binding(value: NativePublicationState): AstroDestinationBinding {
  return { bindingId: value.bindingId, externalId: value.externalId, canonicalUrl: value.canonicalUrl, publicationRevision: value.publicationRevision, contentDisposition: value.contentDisposition };
}

async function assertSafeDirectory(directory: string): Promise<void> {
  await fs.mkdir(directory, { recursive: true });
  const status = await fs.lstat(directory);
  if (!status.isDirectory() || status.isSymbolicLink()) throw new Error("Astro content root is not a safe directory.");
}

function containedFile(root: string, relativeFile: string): string {
  if (path.isAbsolute(relativeFile) || relativeFile.split(/[\\/]/u).some((segment) => !segment || segment === "." || segment === "..")) throw new Error("Astro native publication path is invalid.");
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativeFile);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Astro native publication path escaped its content root.");
  return resolved;
}

async function readState(file: string): Promise<FilesystemState> {
  try {
    const value: unknown = JSON.parse(await readProtectedFile(file, MAXIMUM_STATE_BYTES));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Astro destination state is invalid.");
    const state = value as Partial<FilesystemState>;
    if (state.schemaVersion !== STATE_VERSION || state.adapterId !== "astro-discussion-bridge" || !state.publications || typeof state.publications !== "object" || Array.isArray(state.publications)) throw new Error("Astro destination state is invalid.");
    for (const [resourceId, publication] of Object.entries(state.publications)) validateNativeState(resourceId, publication);
    return state as FilesystemState;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: STATE_VERSION, adapterId: "astro-discussion-bridge", publications: {} }; throw error; }
}

function validateNativeState(resourceId: string, publication: NativePublicationState): void {
  if (!UUID.test(resourceId) || !publication || !/^dbb_[a-f0-9]{32}$/.test(publication.bindingId) || !/^astro:page:[a-f0-9]{32}$/.test(publication.externalId)) throw new Error("Astro destination state identity is invalid.");
  if (!publication.canonicalUrl || !publication.relativeFile || !["complete", "excerpt"].includes(publication.contentDisposition) || !["published", "held", "unpublished"].includes(publication.status)) throw new Error("Astro destination state publication is invalid.");
}

function validateJournal(value: unknown): MutationJournal {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Astro native mutation journal is invalid.");
  const journal = value as MutationJournal;
  if (journal.schemaVersion !== STATE_VERSION || !UUID.test(journal.resourceId) || !/^dbw_[a-f0-9]{32}$/.test(journal.workId) || !["publish", "update", "hold", "unpublish", "restore"].includes(journal.action)) throw new Error("Astro native mutation journal is invalid.");
  validateNativeState(journal.resourceId, journal.nextState);
  return journal;
}

async function atomicWrite(file: string, contents: string, mode = 0o600): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(temporary, "wx", mode);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporary, file);
    await syncDirectory(path.dirname(file));
  } catch (error) { await handle?.close().catch(() => undefined); await fs.rm(temporary, { force: true }).catch(() => undefined); throw error; }
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> { await atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`); }
async function syncDirectory(directory: string): Promise<void> { try { const handle = await fs.open(directory, "r"); try { await handle.sync(); } finally { await handle.close(); } } catch (error) { if (process.platform !== "win32") throw error; } }
async function readFileIfPresent(file: string): Promise<string | null> { try { const status = await fs.lstat(file); if (!status.isFile() || status.isSymbolicLink() || status.size > MAXIMUM_NATIVE_FILE_BYTES) throw new Error("Astro publication destination is not a safe bounded regular file."); return await fs.readFile(file, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
async function readProtectedFile(file: string, maximumBytes: number): Promise<string> { const status = await fs.lstat(file); if (!status.isFile() || status.isSymbolicLink() || status.size > maximumBytes) throw new Error("Astro protected state is not a safe bounded regular file."); return fs.readFile(file, "utf8"); }
async function readPrefix(file: string, maximumBytes: number): Promise<string> { const handle = await fs.open(file, "r"); try { const buffer = Buffer.alloc(maximumBytes); const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0); return buffer.subarray(0, bytesRead).toString("utf8"); } finally { await handle.close(); } }
function journalFile(stateFile: string): string { return `${stateFile}.mutation.json`; }
function hasResourceIdentity(value: string, resourceId: string): boolean { return new RegExp(`^discussionbridgeResourceId:\\s*["']?${resourceId}["']?\\s*$`, "imu").test(value); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function slugify(value: string): string { return value.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 120) || "topic"; }
function boundedPlainText(value: unknown, maximum: number, label: string): string { if (typeof value !== "string" || value !== value.trim() || !value || new TextEncoder().encode(value).byteLength > maximum || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`Astro ${label} is invalid.`); return value; }
function plainValue(value: Record<string, unknown>, fields: string[]): string | null { for (const field of fields) { const candidate = value[field]; if (typeof candidate === "string" && candidate.trim()) return boundedPlainText(candidate.trim(), 200, "source author"); } return null; }
function escapeAttribute(value: string): string { return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function escapeMarkdown(value: string): string { return value.replace(/[\\`*_[\]{}()#+.!|>-]/gu, "\\$&"); }

async function withStateLock<T>(stateFile: string, action: () => Promise<T>): Promise<T> {
  await assertSafeDirectory(path.dirname(stateFile));
  try { const status = await fs.lstat(stateFile); if (!status.isFile() || status.isSymbolicLink()) throw new Error("Astro destination state is not a safe regular file."); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  let release: (() => Promise<void>) | undefined;
  try { release = await lock(stateFile, { realpath: false, retries: 0, stale: 30_000, update: 10_000 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ELOCKED") throw new Error(`Astro destination state is already in use: ${stateFile}`); throw error; }
  try { return await action(); }
  finally { await release(); }
}
