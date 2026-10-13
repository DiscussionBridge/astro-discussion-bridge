import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  normalizePublicHttpUrl,
  normalizeServiceBaseUrl,
  parsePublicDiscourseTopicUrl,
} from "../dist/web-url.js";
import discussionBridge, {
  isInteractiveCommentsMode,
  normalizeCommentsMode,
} from "../dist/index.js";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Execute the component's actual server-side frontmatter, not a copied selector.
// This is a source-boundary test, not an Astro render or browser qualification.
async function componentEvaluator(name, bindings, result) {
  const source = await fs.readFile(path.join(packageDir, "src/components", name), "utf8");
  const frontmatter = source.split(/^---\s*$/m)[1];
  assert.equal(typeof frontmatter, "string", "component frontmatter is required");
  const parsed = ts.createSourceFile(name + ".ts", frontmatter, ts.ScriptTarget.Latest, true);
  const withoutImports = ts.factory.updateSourceFile(
    parsed,
    parsed.statements.filter((statement) => !ts.isImportDeclaration(statement)),
  );
  const compiled = ts.transpileModule(ts.createPrinter().printFile(withoutImports), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics.filter((entry) => entry.category === ts.DiagnosticCategory.Error), []);
  return new Function(...Object.keys(bindings), compiled.outputText + "\nreturn (" + result + ");");
}

test("actual Discussion selector preserves invalid overrides and canonical precedence", async () => {
  const bindings = { Astro: null, config: null, normalizeCommentsMode, isInteractiveCommentsMode };
  const evaluate = await componentEvaluator("Discussion.astro", bindings, "display");
  const select = (props, frontmatter, configured = "interactive") => evaluate(
    { props: { ...props, frontmatter } },
    { comments: { enabled: true, display: configured } },
    normalizeCommentsMode,
    isInteractiveCommentsMode,
  );
  assert.equal(select({}, {}), "interactive", "absent inputs may use the configured default");
  assert.equal(select({ display: undefined }, { discussionCommentsDisplay: undefined }), "interactive");
  for (const mode of ["simple", "full", "interactive"]) {
    assert.equal(select({}, {}, mode), mode);
    assert.equal(select({}, { discussionCommentsDisplay: mode }), mode);
    assert.equal(select({ display: mode }, { discussionCommentsDisplay: null }), mode);
  }
  for (const invalid of [
    null, "", false, 0, [], {}, "bridge", "fullInteractive", "full_interactive",
    " interactive", "interactive ", " interactive ", "\tinteractive\t",
    "\ninteractive\n", "\rinteractive\r", "\r\ninteractive\r\n",
    "\u00a0interactive\u00a0", "\u2003interactive\u2003", "\ufeffinteractive\ufeff",
  ]) {
    assert.equal(select({}, { discussionCommentsDisplay: invalid }), undefined, "invalid page override must not inherit Interactive");
    assert.equal(select({ display: invalid }, { discussionCommentsDisplay: "interactive" }), undefined, "invalid direct override must take precedence");
  }
});

test("actual Interactive component retains valid mapping and missing-mapping denial", async () => {
  const bindings = {
    Astro: null, config: null, normalizePublicHttpUrl, normalizeServiceBaseUrl,
    parsePublicDiscourseTopicUrl, isInteractiveCommentsMode,
  };
  const evaluate = await componentEvaluator("DiscourseDiscussion.astro", bindings, "{ fullApp, resolvedTopicId, sourceUrl }");
  const run = (props, display = "interactive") => evaluate(
    { props, url: new URL("https://site.example/page/") },
    { discourseUrl: "https://forum.example/community/", comments: { enabled: true, display } },
    normalizePublicHttpUrl, normalizeServiceBaseUrl, parsePublicDiscourseTopicUrl, isInteractiveCommentsMode,
  );
  assert.deepEqual(run({ topicId: 42, topicUrl: "https://forum.example/community/t/page/42" }), {
    fullApp: true, resolvedTopicId: 42, sourceUrl: undefined,
  });
  assert.throws(() => run({}), /Interactive requires one completed Bridge topic mapping/);
  assert.throws(() => run({ topicId: 42, topicUrl: "https://forum.example/community/t/page/43" }), /same topic/);
  assert.equal(run({}, "full").fullApp, false);
  assert.equal(run({}, "full").sourceUrl, "https://site.example/page/");
});

test("presentation preserves Simple, Full, and mapped Interactive modes followed by one credit", async () => {
  const discussion = await fs.readFile(path.join(packageDir, "src/components/Discussion.astro"), "utf8");
  const discourse = await fs.readFile(path.join(packageDir, "src/components/DiscourseDiscussion.astro"), "utf8");
  const replies = await fs.readFile(path.join(packageDir, "src/components/DiscourseReplies.astro"), "utf8");
  const live = await fs.readFile(path.join(packageDir, "src/simple-live.ts"), "utf8");
  assert.equal((discussion.match(/<DiscourseDiscussion\b/g) ?? []).length, 1);
  assert.equal((discussion.match(/<DiscourseReplies\b/g) ?? []).length, 1);
  assert.equal((discussion.match(/<DiscussionCredit\b/g) ?? []).length, 1);
  assert.match(discussion, /display === "simple"/);
  assert.match(discussion, /config\.comments\.enabled && display !== undefined/);
  assert.doesNotMatch(discussion, /\)\s*\?\? config\.comments\.display/);
  assert.match(discussion, /fullApp=\{isInteractiveCommentsMode\(display\)\}/);
  assert.match(discussion, /frontmatter\.discussionFromDiscourse === true/);
  assert.match(discussion, /frontmatter\.discussionbridgeNativePublication === true/);
  assert.match(discussion, /discussion-bridge-source-presentation/);
  assert.match(discussion, /embedClassName=\{embedClassName\}/);
  assert.match(discussion, /<DiscourseDiscussion[\s\S]*sourceUrl=\{Astro\.props\.sourceUrl\}/);
  assert.match(replies, /Number\(post\.post_number\) > 1/);
  assert.match(replies, /sanitizeHtml/);
  assert.match(replies, /FETCH_BATCH_SIZE = 20/);
  assert.match(replies, /MAX_REPLIES = 50/);
  assert.match(replies, /INITIAL_REPLIES = 5/);
  assert.match(replies, /post_ids\[\]/);
  assert.match(replies, /Show \{remainingReplies\.length\} more/);
  assert.match(replies, /<details class="discussion-bridge-simple__more">/);
  assert.match(replies, /data-discussionbridge-simple-live/);
  assert.match(replies, /startSimpleComments/);
  assert.match(replies, /<style is:global>/);
  assert.doesNotMatch(replies, /:global\(/);
  assert.match(live, /credentials: "omit"/);
  assert.match(live, /redirect: "error"/);
  assert.match(live, /DOMPurify\.sanitize/);
  assert.match(live, /MAX_REPLIES = 50/);
  assert.match(live, /INITIAL_REPLIES = 5/);
  assert.match(live, /data-discussionbridge-simple-status/);
  assert.match(discourse, /const resolvedTopicId = topicId \?\? topicReference\?\.topicId/);
  assert.match(discourse, /resolvedTopicId \? \{ topicId: resolvedTopicId \} : \{ discourseEmbedUrl: sourceUrl \}/);
  assert.match(discourse, /Interactive requires one completed Bridge topic mapping/);
  assert.match(discourse, /fullApp \? \{ fullApp: true/);
  assert.doesNotMatch(discussion, /targets?|relationships?|navigation/i);
});

test("plugin-free full mode can start from the canonical Astro page URL", async () => {
  const discussion = await fs.readFile(path.join(packageDir, "src/components/Discussion.astro"), "utf8");
  const discourse = await fs.readFile(path.join(packageDir, "src/components/DiscourseDiscussion.astro"), "utf8");
  assert.match(discussion, /<DiscourseDiscussion[\s\S]*sourceUrl=\{Astro\.props\.sourceUrl\}/);
  assert.match(discourse, /Astro\.props\.sourceUrl \?\? Astro\.url\.href/);
  assert.match(discourse, /normalizePublicHttpUrl/);
  assert.match(discourse, /define:vars=\{\{[^}]*sourceUrl/);
  assert.match(discourse, /discourseEmbedUrl: sourceUrl/);
});

test("From Discourse component renders only server-retrieved sanitized record content", async () => {
  const component = await fs.readFile(path.join(packageDir, "src/components/FromDiscourse.astro"), "utf8");
  assert.match(component, /fetchFromDiscourseRecord/);
  assert.match(component, /showTopicLink/);
  assert.match(component, /showTopicLink &&/);
  assert.match(component, /astro-discussion-bridge\/bridge-record/);
  assert.match(component, /process\.env\.DISCUSSIONBRIDGE_CONNECTION_SECRET/);
  assert.match(component, /set:html=\{contentHtml\}/);
  assert.match(component, /record\.topicUrl/);
  assert.match(component, /aria-label="On this page"/);
  assert.match(component, /<h\(\[23\]\)/);
  assert.match(component, /headings\.length >= 2/);
  assert.doesNotMatch(component, /client:|X-DiscussionBridge|connectionSecret\}/);
});

test("Interactive accepts only the canonical mode value", () => {
  assert.equal(normalizeCommentsMode("interactive"), "interactive");
  assert.equal(isInteractiveCommentsMode("interactive"), true);
  for (const mode of ["fullInteractive", "full_interactive"]) {
    assert.equal(normalizeCommentsMode(mode), undefined);
    assert.equal(isInteractiveCommentsMode(mode), false);
    assert.throws(() => discussionBridge({
      discourseUrl: "https://forum.example/",
      comments: { display: mode },
    }), /Comments display must be/);
  }
  assert.equal(normalizeCommentsMode("bridge"), undefined);
  assert.throws(() => discussionBridge({
    discourseUrl: "https://forum.example/",
    comments: { display: "bridge" },
  }), /Comments display must be/);
});

test("Interactive defaults to a bounded viewport and configured ceilings fail closed", async () => {
  const integration = await fs.readFile(path.join(packageDir, "src/index.ts"), "utf8");
  assert.match(integration, /dynamicHeight: options\.comments\?\.dynamicHeight \?\? false/);
  assert.throws(() => discussionBridge({
    discourseUrl: "https://forum.example/",
    comments: { embedMaxHeight: "900px" },
  }), /height ceilings/);
  assert.throws(() => discussionBridge({
    discourseUrl: "https://forum.example/",
    comments: { embedViewportMaxHeight: "80vh" },
  }), /height ceilings/);
  assert.doesNotThrow(() => discussionBridge({
    discourseUrl: "https://forum.example/",
    comments: { dynamicHeight: true, embedMaxHeight: "none", embedViewportMaxHeight: "none" },
  }));
});
