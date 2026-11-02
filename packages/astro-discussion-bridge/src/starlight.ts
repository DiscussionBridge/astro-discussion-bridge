import type { AstroIntegration } from "astro";
import { createRequire } from "node:module";
import { promises as fs, lstatSync, openSync, fstatSync, readFileSync, closeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { semanticIdentity, validateCms } from "../src/private/cms-runtime.mjs";
import type { PublishControlledDiscussionsOptions } from "./controlled-creation.js";
import { nativePublicationFiles } from "./native-publication.js";
import { nativeLifecycle, parseMarkdown } from "./native-source.js";
import { sourceOriginalKey } from "./to-source-profile.js";
import { captureNativeArticle, NativePreparationLimitation } from "./native-preparation.js";
import { issueNativeRenderedArticle, nativeRenderHash as hash, type NativeRenderedArticle, type NativeControlRange } from "./native-render.js";

const recipe = "starlight-heading-controls-1";
const controlMarker = "data-discussionbridge-native-heading";
const documentMarker = "data-discussionbridge-native-document";
const knownEntry = "1ed47fbddd59f347d29b57dd6ba36ebe90d3b4d0ec48768155d666659ae30ed6";
const knownSetup = "792d14b27c9d6b6b28c1bc65db35c6ace1e3ea79439e6e59ee4f0a676cf46a3b";
const knownFactory = "39f0b7a9b4dbcf32cea6800485bcd6945ab444b89734f444b02b749ebb22e212";
interface Tree { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: Tree[] }
interface FactoryInput { fileURL?: URL; source: string; sourceFormat: string }
interface VisitorContext { replaceNode(root: Tree, next: Tree): void }
interface Visitor { name: string; element?: { filter: string[]; visit(node: Tree, context: VisitorContext): Tree | void | Promise<Tree | void> }; after?: (root: Tree, context: VisitorContext) => void | Promise<void> }
type Plugin = Visitor | ((input: FactoryInput) => Plugin) | Plugin[] | undefined | null | false;
interface ControlWitness { nonce: string; parent: Tree; anchor: Tree }
interface DocumentWitness {
  version: 1; recipe: typeof recipe; documentNonce: string; producerKey: string;
  nativeFile: string; originalSource: string; originalKey: string;
  compilerSource: string; compilerSourceSha256: string; controls: ControlWitness[];
}
interface HtmlNode { type: string; name?: string; data?: string; attribs?: Record<string, string>; children?: HtmlNode[]; parent?: HtmlNode; startIndex?: number | null; endIndex?: number | null }
const { parseDocument } = createRequire(createRequire(import.meta.url).resolve("sanitize-html"))("htmlparser2") as { parseDocument(value: string, options: object): HtmlNode };
function requireCondition(condition: unknown, message: string): asserts condition { if (!condition) throw new NativePreparationLimitation(message); }
const allNodes = (root: HtmlNode) => { const nodes: HtmlNode[] = [], pending = [root]; while (pending.length) { const node = pending.pop()!; nodes.push(node); for (const child of node.children ?? []) pending.push(child); } return nodes; };
function openingEnd(html: string, start: number) {
  let quote = "";
  for (let index = start; index < html.length; index++) { const value = html[index]; if (quote) { if (value === quote) quote = ""; } else if (value === '"' || value === "'") quote = value; else if (value === ">") return index + 1; }
  throw new NativePreparationLimitation("Native Starlight markup has an incomplete opening boundary.");
}
function removeRanges(html: string, ranges: { start: number; end: number }[]) {
  let result = html, boundary = html.length;
  for (const range of [...ranges].sort((left, right) => right.start - left.start)) {
    requireCondition(Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end) && range.start >= 0 && range.end > range.start && range.end <= boundary, "Native Starlight render ranges overlap or differ.");
    result = result.slice(0, range.start) + result.slice(range.end); boundary = range.start;
  }
  return result;
}
function meaning(node: HtmlNode): unknown {
  if (node.type === "text") return node.data;
  return [node.name, Object.entries(node.attribs ?? {}).filter(([name]) => name !== controlMarker && name !== documentMarker).sort(), (node.children ?? []).map(meaning)];
}
function expected(node: Tree): unknown {
  if (node.type === "text") return node.value;
  return [node.tagName, Object.entries(node.properties ?? {}).map(([name, value]) => [name, value === true ? "" : Array.isArray(value) ? value.join(" ") : String(value)]).sort(), (node.children ?? []).map(expected)];
}
function compilerSnapshot(file: string) {
  for (let directory = path.dirname(file);;) {
    const entry = lstatSync(directory);
    requireCondition(entry.isDirectory() && !entry.isSymbolicLink(), "Native Starlight source ancestors must be unlinked directories.");
    const parent = path.dirname(directory); if (parent === directory) break; directory = parent;
  }
  const before = lstatSync(file, { bigint: true });
  requireCondition(before.isFile() && !before.isSymbolicLink(), "Native Starlight source must be an unlinked regular file.");
  const handle = openSync(file, "r");
  try {
    const current = fstatSync(handle, { bigint: true });
    requireCondition(current.dev === before.dev && current.ino === before.ino, "Native Starlight source changed before compile capture.");
    return new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(handle));
  } finally { closeSync(handle); }
}
function configSnapshot(value: unknown, version: string | undefined): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "function") { requireCondition(Boolean(version?.trim()), "Native Starlight compiler extensions require an explicit configuration version."); return { functionSource: hash(String(value)) }; }
  if (Array.isArray(value)) return value.map(item => configSnapshot(item, version));
  requireCondition(typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype
    && Reflect.ownKeys(value).every(key => typeof key === "string"), "Native Starlight configuration needs an explicit supported snapshot.");
  return Object.fromEntries(Object.entries(value as object).map(([name, item]) => [name, configSnapshot(item, version)]));
}
export interface NativeStarlightPublicationOptions {
  source: PublishControlledDiscussionsOptions;
  native: Record<string, unknown>;
  /** Required when native configuration contains compiler-extension functions. */
  configurationVersion?: string;
}
export interface NativeStarlightRenderInput { filePath: string; nativeBody: string; sourceArticleUrl: string; html: string }

/** Actual public Starlight integration plus a private source-render binding. */
export async function createNativeStarlightPublication(options: NativeStarlightPublicationOptions) {
  const docs = path.resolve(options.source.docsDir), state = path.resolve(options.source.stateFile), store = state + ".starlight-native";
  const privateRelative = path.relative(docs, store);
  requireCondition(privateRelative === ".." || privateRelative.startsWith(".." + path.sep) || path.isAbsolute(privateRelative), "Native Starlight render evidence must stay outside source content.");
  await nativePublicationFiles.assertDirectory(docs);
  const root = await fs.lstat(docs, { bigint: true });
  requireCondition(root.isDirectory() && !root.isSymbolicLink(), "Native Starlight source root requires reconciliation.");
  // Starlight has an import-only public export; require.resolve would select
  // the wrong conditions and fail before the real native integration loads.
  const peerName = "@astrojs/starlight", peer = fileURLToPath(import.meta.resolve(peerName));
  requireCondition(hash(await fs.readFile(peer, "utf8")) === knownEntry, "This native Starlight producer identity has not been qualified for heading-control preparation.");
  const manifest = JSON.parse(await fs.readFile(path.join(path.dirname(peer), "../package.json"), "utf8"));
  requireCondition(manifest.name === "@astrojs/starlight" && manifest.version === "0.42.0", "This native Starlight producer identity has not been qualified for heading-control preparation.");
  // Resolve the public peer at runtime. Its development TypeScript entry uses
  // bundler resolution; it is not part of this package's NodeNext compilation.
  const factory = (await import(peerName)).default as (value: Record<string, unknown>) => AstroIntegration;
  const integration = factory(options.native), setup = integration.hooks["astro:config:setup"];
  requireCondition(typeof setup === "function" && hash(String(setup)) === knownSetup, "Native Starlight setup identity differs from the qualified producer.");
  const producerKey = hash(semanticIdentity({ recipe, source: { docs, site: options.source.siteUrl, forum: options.source.discourseUrl,
    connection: options.source.controlledCreation.connectionId, rootDev: String(root.dev), rootIno: String(root.ino) },
    native: { version: manifest.version, entry: knownEntry, setup: knownSetup, factory: knownFactory },
    configuration: configSnapshot(options.native, options.configurationVersion), configurationVersion: options.configurationVersion ?? null }));
  async function immutable(name: string, contents: string) {
    await nativePublicationFiles.assertDirectory(store);
    const file = path.join(store, name), prior = await nativePublicationFiles.readExisting(file);
    if (prior) { requireCondition(prior.contents === contents, "Immutable native Starlight render evidence differs."); return; }
    await nativePublicationFiles.write(file, contents, null);
  }
  integration.hooks["astro:config:setup"] = async function (context) {
    for (const publicRoot of [context.config.outDir, context.config.publicDir]) {
      const relative = path.relative(fileURLToPath(publicRoot), store);
      requireCondition(relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative), "Native Starlight evidence must stay outside public input/output.");
    }
    await nativePublicationFiles.assertDirectory(store); await nativePublicationFiles.mkdir(store); await nativePublicationFiles.assertDirectory(store);
    const processor = context.config.markdown.processor as unknown as { name: string; options: { hastPlugins: Plugin[] } };
    requireCondition(processor.name === "satteri" && Array.isArray(processor.options?.hastPlugins), "The qualified native Starlight source recipe requires its public Satteri processor.");
    const before = [...processor.options.hastPlugins]; await setup!.call(this, context);
    requireCondition((context.config.markdown.processor as unknown) === processor && processor.options.hastPlugins.length === before.length + 1
      && before.every((value, index) => processor.options.hastPlugins[index] === value), "Native Starlight did not perform the exact append-only producer registration.");
    const nativeFactory = processor.options.hastPlugins[before.length];
    requireCondition(typeof nativeFactory === "function" && hash(String(nativeFactory)) === knownFactory, "Native Starlight heading factory differs from the qualified producer.");
    processor.options.hastPlugins[before.length] = (input: FactoryInput) => {
      const nativeResult = (nativeFactory as (value: FactoryInput) => Plugin)(input);
      if (!(input.fileURL instanceof URL) || input.sourceFormat !== "markdown") return nativeResult;
      const file = fileURLToPath(input.fileURL), relative = path.relative(docs, file);
      if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative) || path.extname(file).toLowerCase() !== ".md") return nativeResult;
      const originalSource = compilerSnapshot(file), parsed = parseMarkdown(originalSource);
      if (nativeLifecycle(parsed.frontmatter) !== "published") return nativeResult;
      requireCondition(input.source.trim() === parsed.body.trim(), "Actual Starlight compiler input differs from its physical article.");
      const document: DocumentWitness = { version: 1, recipe, documentNonce: randomUUID(), producerKey, nativeFile: file,
        originalSource, originalKey: sourceOriginalKey(originalSource), compilerSource: input.source, compilerSourceSha256: hash(input.source), controls: [] };
      const observe = (value: Plugin): Plugin => {
        if (Array.isArray(value)) return value.map(observe);
        if (typeof value === "function") return next => observe(value(next));
        if (!value || !value.element || typeof value.element.visit !== "function") return value;
        const visit = value.element.visit;
        return { ...value, element: { ...value.element, async visit(node, visitor) {
          const heading = /^h[1-6]$/u.test(node.tagName ?? "") ? JSON.stringify(node) : undefined;
          const result = await visit.call(this, node, visitor);
          if (!heading || result === undefined || result === null || result === node) return result;
          requireCondition(result.tagName === "div" && result.children?.length === 2 && result.children[0] === node
            && JSON.stringify(node) === heading, "Native Starlight changed the original heading during control generation.");
          const anchor = result.children![1];
          requireCondition(anchor.tagName === "a" && anchor.properties?.href === "#" + node.properties?.id
            && !Object.hasOwn(anchor.properties!, controlMarker), "Native Starlight returned an unsupported generated-control structure.");
          const nonce = randomUUID();
          document.controls.push({ nonce, parent: JSON.parse(JSON.stringify(result)), anchor: JSON.parse(JSON.stringify(anchor)) });
          anchor.properties![controlMarker] = nonce; return result;
        } } };
      };
      return [observe(nativeResult), { name: "discussionbridge-native-document-origin", async after(tree, visitor) {
        const current = compilerSnapshot(file);
        requireCondition(sourceOriginalKey(current) === document.originalKey && parseMarkdown(current).body === parsed.body, "Native Starlight source changed during its actual compile.");
        await immutable(`document-${document.documentNonce}.json`, semanticIdentity(document) + "\n");
        visitor.replaceNode(tree, { type: "root", children: [{ type: "element", tagName: "div",
          properties: { [documentMarker]: document.documentNonce }, children: [...tree.children ?? []] }] });
      } }];
    };
  };
  async function render(input: NativeStarlightRenderInput): Promise<NativeRenderedArticle> {
    const file = path.resolve(input.filePath), relative = path.relative(docs, file);
    requireCondition(relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative), "Native Starlight renderer belongs outside its source corpus.");
    await nativePublicationFiles.assertDirectory(path.dirname(file));
    const current = await nativePublicationFiles.readExisting(file);
    requireCondition(current && parseMarkdown(current.contents).body.trim() === input.nativeBody.trim(), "Native Starlight render body differs from its actual source.");
    const original = current!.contents, originalKey = sourceOriginalKey(original);
    await nativePublicationFiles.assertDirectory(store);
    // The full native rendering is retained even if origin association refuses.
    const originalArtifact = semanticIdentity({ version: 1, recipe, producerKey, nativeFile: file, originalKey,
      sourceArticleUrl: input.sourceArticleUrl, originalSource: original, renderedHtml: input.html });
    await immutable(`render-original-${hash(originalArtifact)}.json`, originalArtifact + "\n");
    try {
      const nodes = allNodes(parseDocument(input.html, { withStartIndices: true, withEndIndices: true, lowerCaseAttributeNames: false, lowerCaseTags: false }));
      const owners = nodes.filter(node => node.attribs?.[documentMarker] !== undefined);
      requireCondition(owners.length === 1, "One actual native Starlight document-origin boundary is required.");
      const owner = owners[0], nonce = owner.attribs![documentMarker]; validateCms("UUID", nonce);
      const stored = await nativePublicationFiles.readExisting(path.join(store, `document-${nonce}.json`));
      requireCondition(stored, "Native Starlight producer evidence is missing; it cannot be inferred from HTML.");
      const document = JSON.parse(stored!.contents) as DocumentWitness;
      requireCondition(document.version === 1 && document.recipe === recipe && document.documentNonce === nonce && document.producerKey === producerKey
        && path.resolve(document.nativeFile) === file && document.originalKey === originalKey && sourceOriginalKey(document.originalSource) === originalKey
        && document.compilerSourceSha256 === hash(document.compilerSource) && document.compilerSource.trim() === parseMarkdown(original).body.trim()
        && Array.isArray(document.controls), "Native Starlight source/configuration/producer evidence differs.");
      const witnesses = new Map(document.controls.map(control => { validateCms("UUID", control.nonce); return [control.nonce, control] as const; }));
      requireCondition(witnesses.size === document.controls.length, "Native Starlight producer control identities are duplicated.");
      const marked = nodes.filter(node => node.attribs?.[controlMarker] !== undefined), seen = new Set<string>();
      requireCondition(marked.length === witnesses.size, "Native Starlight document/control evidence is incomplete.");
      const remove: { start: number; end: number }[] = [], rawControls: { start: number; end: number }[] = [];
      const open = openingEnd(input.html, owner.startIndex!), close = input.html.lastIndexOf("</", owner.endIndex!);
      requireCondition(owner.name === "div" && Object.keys(owner.attribs!).length === 1 && close >= open && input.html.slice(close, owner.endIndex! + 1) === "</div>"
        && !input.html.slice(0, owner.startIndex!).trim() && !input.html.slice(owner.endIndex! + 1).trim(), "Native Starlight document boundary is ambiguous.");
      remove.push({ start: owner.startIndex!, end: open }, { start: close, end: owner.endIndex! + 1 });
      for (const node of marked) {
        const id = node.attribs![controlMarker], witness = witnesses.get(id);
        requireCondition(witness && !seen.has(id), "Native Starlight control evidence is unknown or duplicated."); seen.add(id);
        let ancestor: HtmlNode | undefined = node; while (ancestor && ancestor !== owner) ancestor = ancestor.parent;
        requireCondition(ancestor === owner && node.name === "a" && semanticIdentity(meaning(node)) === semanticIdentity(expected(witness!.anchor)), "Native Starlight control differs from its actual producer subtree.");
        const parent = semanticIdentity(expected(witness!.parent));
        requireCondition(node.parent && semanticIdentity(meaning(node.parent)) === parent
          && nodes.filter(value => value.name === node.parent!.name && semanticIdentity(meaning(value)) === parent).length === 1, "Native Starlight heading/control association is moved or ambiguous.");
        const start = node.startIndex!, end = node.endIndex! + 1, opening = input.html.slice(start, openingEnd(input.html, start));
        const literal = ` ${controlMarker}="${id}"`, offset = opening.indexOf(literal);
        requireCondition(offset >= 0 && opening.indexOf(literal, offset + 1) < 0
          && [...opening.matchAll(/\sdata-discussionbridge-native-heading\s*=/giu)].length === 1, "Native Starlight control metadata boundary differs.");
        remove.push({ start: start + offset, end: start + offset + literal.length }); rawControls.push({ start, end });
      }
      requireCondition(seen.size === witnesses.size, "Native Starlight control association is incomplete.");
      const full = removeRanges(input.html, remove);
      const mapped = (position: number) => remove.filter(range => range.end <= position).reduce((value, range) => value - (range.end - range.start), position);
      const controls: NativeControlRange[] = rawControls.map(range => ({ start: mapped(range.start), end: mapped(range.end),
        sha256: hash(removeRanges(input.html.slice(range.start, range.end), remove.filter(value => value.start >= range.start && value.end <= range.end).map(value => ({ start: value.start - range.start, end: value.end - range.start })))) })).sort((left, right) => left.start - right.start);
      const artifact = semanticIdentity({ version: 1, recipe, producerKey, nativeFile: file, originalKey, document, originalSource: original, markedHtml: input.html, fullHtml: full, controls });
      const artifactSha256 = hash(artifact); await immutable(`render-${artifactSha256}.json`, artifact + "\n");
      const checked = await nativePublicationFiles.readExisting(file);
      requireCondition(checked && checked.dev === current!.dev && checked.ino === current!.ino && checked.contents === original, "Native Starlight source changed during render association.");
      return issueNativeRenderedArticle(full, { nativeFile: file, originalMarkdownSha256: hash(parseMarkdown(original).body), originalKey, producerKey, artifactSha256, controls });
    } catch (error) {
      const limitation = error instanceof NativePreparationLimitation ? error : new NativePreparationLimitation("Native Starlight render-origin evidence requires reconciliation; original retained.");
      limitation.capture = { ...captureNativeArticle(parseMarkdown(original).body, input.sourceArticleUrl, "markdown"), renderedHtml: input.html }; throw limitation;
    }
  }
  return { integration, render };
}
