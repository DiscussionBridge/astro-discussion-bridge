import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";
import {
  publishControlledDiscussions,
  replaceFileAtomically,
  resolveControlledCreation,
} from "../dist/controlled-creation.js";

const CONNECTION_ID = "dbc_aaaaaaaaaaaaaaaaaaaaaaaa";
const CONNECTION_SECRET = "s".repeat(32);
const RESOURCE_ID = "11111111-1111-4111-8111-111111111111";
const EXTERNAL_ID = `astro-page:${"b".repeat(64)}`;

function bridgePayload(topicId, outcome = "created", resourceId = RESOURCE_ID, requestInit) {
  const sourceRevision = requestInit?.body ? JSON.parse(requestInit.body).bridge_record.source_publication?.revision : undefined;
  return {
    outcome,
    reason: outcome === "created" ? "bridge_record_created" : "existing_bridge_record",
    resource_id: resourceId,
    topic_id: topicId,
    topic_url: `https://forum.example/community/t/example/${topicId}`,
    direction: "to_discourse",
    core_fallback: false,
    ...(sourceRevision ? { source_revision: sourceRevision } : {}),
  };
}

async function fixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "discussionbridge-controlled-"));
  for (const [name, contents] of Object.entries(files)) {
    const filePath = path.join(root, name);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents);
  }
  return root;
}

function options(root) {
  return {
    docsDir: root,
    stateFile: path.join(root, ".discussionbridge-state.json"),
    siteUrl: "https://site.example/",
    discourseUrl: "https://forum.example/community/",
    controlledCreation: {
      connectionId: CONNECTION_ID,
      connectionSecret: CONNECTION_SECRET,
      lane: "docs",
    },
  };
}

test("large skipped corpus has bounded concurrent reads and no dispatch", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-census-");
  const names = Array.from({ length: 75 }, (_, index) => `page-${String(index).padStart(3, "0")}.md`);
  await Promise.all(names.map((name) => fs.writeFile(path.join(root, name), "---\ntitle: Skipped\ndiscussionCommentsDisplay: simple\n---\nLocal page.\n")));
  const originalRead = fs.readFile;
  const originalFetch = globalThis.fetch;
  let active = 0;
  let peak = 0;
  let requests = 0;
  fs.readFile = async function (file, ...args) {
    if (!String(file).endsWith(".md")) return originalRead.call(this, file, ...args);
    active++;
    peak = Math.max(peak, active);
    try {
      await new Promise((resolve) => setImmediate(resolve));
      return await originalRead.call(this, file, ...args);
    } finally { active--; }
  };
  globalThis.fetch = async () => { requests++; throw new Error("Skipped corpus must not dispatch"); };
  try {
    const results = await publishControlledDiscussions(options(root));
    assert.deepEqual(results.map((entry) => path.basename(entry.filePath)), names);
    assert.equal(results.every((entry) => entry.status === "skipped"), true);
    assert.ok(peak > 1 && peak <= 32, `Source reads must overlap within the 32-file bound; peak=${peak}`);
    assert.equal(requests, 0);
    assert.equal(active, 0);
  } finally {
    fs.readFile = originalRead;
    globalThis.fetch = originalFetch;
  }
});

test("unsupported modes cannot authorize a controlled request", async (t) => {
  const source = (mode) => `---\ntitle: Rejected\ndiscussionCommentsDisplay: ${mode}\ndiscussionSync: true\n---\nRejected page.\n`;
  const files = {
    "camel-case.md": source("fullInteractive"),
    "underscore.md": source("full_interactive"),
    "null.md": source("null"),
    "empty-yaml.md": source(""),
    "empty-string.md": source('""'),
    "false.md": source("false"),
    "unknown.md": source("bridge"),
    "number.md": source("0"),
    "array.md": source("[interactive]"),
    "object.md": source("{ mode: interactive }"),
    "none.md": source("none"),
    "simple.md": source("simple"),
    "full.md": source("full"),
  };
  for (const [name, mode] of Object.entries({
    "leading-space": " interactive",
    "trailing-space": "interactive ",
    "spaces": " interactive ",
    "tab": "\tinteractive\t",
    "newline": "\ninteractive\n",
    "carriage-return": "\rinteractive\r",
    "crlf": "\r\ninteractive\r\n",
    "nbsp": "\u00a0interactive\u00a0",
    "em-space": "\u2003interactive\u2003",
    "bom": "\ufeffinteractive\ufeff",
  })) {
    files[name + ".md"] = source(JSON.stringify(mode));
  }
  files["absent.md"] = "---\ntitle: Absent\ndiscussionSync: true\n---\nNo explicit mode.\n";
  const root = await fixture(files);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    assert.fail("unsupported mode dispatched a request");
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const results = await publishControlledDiscussions(options(root));

  assert.equal(results.length, Object.keys(files).length);
  assert.equal(results.every((result) => result.status === "skipped" && result.reason === "Interactive not requested"), true);
  assert.equal(requests, 0);
  assert.deepEqual((await fs.readdir(root)).sort(), Object.keys(files).sort(), "invalid input must not create operation or binding files");
  const stateSource = JSON.stringify({
    schemaVersion: 1,
    adapterId: "astro-discussion-bridge",
    operations: {
      [EXTERNAL_ID]: {
        externalId: EXTERNAL_ID,
        canonicalUrl: "https://site.example/preexisting/",
        correlationId: "22222222-2222-4222-8222-222222222222",
        attempts: 1,
        outcome: "created",
        retryable: false,
        reconciliationRequired: false,
        lastAttemptAt: "2026-10-10T00:00:00.000Z",
        resourceId: RESOURCE_ID,
        topicId: 40,
        topicUrl: "https://forum.example/community/t/preexisting/40",
      },
    },
  }) + "\n";
  await fs.writeFile(options(root).stateFile, stateSource);
  assert.deepEqual(await publishControlledDiscussions(options(root)), results);
  assert.equal(await fs.readFile(options(root).stateFile, "utf8"), stateSource, "invalid input must preserve existing operations byte-for-byte");
  assert.equal(requests, 0);
  assert.deepEqual((await fs.readdir(root)).sort(), [...Object.keys(files), ".discussionbridge-state.json"].sort());
  for (const [name, content] of Object.entries(files)) {
    assert.equal(await fs.readFile(path.join(root, name), "utf8"), content);
  }
});

test("only explicitly authorized published interactive pages make a controlled request", async (t) => {
  const root = await fixture({
    "authorized.md": "---\ntitle: Authorized\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\n---\n# Authorized\n\nMeaningful **Astro** content.\n\n<script>unsafe()</script>\n",
    "omitted.md": "---\ndiscussionCommentsDisplay: interactive\n---\n",
    "false.md": "---\ndiscussionCommentsDisplay: interactive\ndiscussionSync: false\n---\n",
    "string-false.md": "---\ndiscussionCommentsDisplay: interactive\ndiscussionSync: \"true\"\n---\n",
    "draft.md": "---\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\ndraft: true\n---\n",
    "draft-string.md": "---\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\ndraft: \"true\"\n---\n",
    "unpublished.md": "---\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\npublished: false\n---\n",
    "published-string.md": "---\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\npublished: \"false\"\n---\n",
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const requests = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify(bridgePayload(41, undefined, undefined, init)), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const results = await publishControlledDiscussions(options(root));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://forum.example/community/discussion-bridge/v1/bridge-records/resolve.json");
  assert.equal(requests[0].init.redirect, "error");
  assert.equal(requests[0].init.headers["X-DiscussionBridge-Connection"], CONNECTION_ID);
  assert.equal(requests[0].init.headers["X-DiscussionBridge-Secret"], CONNECTION_SECRET);
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.bridge_record.adapter_version, "0.3.0-alpha.1");
  assert.deepEqual(
    Object.keys(body.bridge_record).sort(),
    ["adapter_id", "adapter_version", "canonical_url", "content_html", "correlation_id", "direction", "external_id", "lane", "published", "title", "visibility", "source_publication"].sort(),
  );
  assert.equal(body.bridge_record.canonical_url, "https://site.example/authorized/");
  assert.equal(body.bridge_record.direction, "to_discourse");
  assert.match(body.bridge_record.content_html, /<h1[^>]*>Authorized<\/h1>/);
  assert.match(body.bridge_record.content_html, /Meaningful <strong>Astro<\/strong> content/);
  assert.doesNotMatch(body.bridge_record.content_html, /script|unsafe/);
  assert.equal(body.bridge_record.published, true);
  assert.match(body.bridge_record.external_id, /^astro-page:[0-9a-f]{64}$/);
  assert.equal(results.filter((result) => result.status !== "skipped").length, 1);
  const updated = await fs.readFile(path.join(root, "authorized.md"), "utf8");
  assert.match(updated, /discussionbridgeExternalId: "astro-page:[0-9a-f]{64}"/);
  assert.match(updated, /discussionbridgeResourceId: "11111111-1111-4111-8111-111111111111"/);
  assert.match(updated, /discourseTopicId: "41"/);
  assert.match(updated, /discourseTopicUrl: "https:\/\/forum\.example\/community\/t\/example\/41"/);
});

test("canonical interactive pages use the same controlled-creation path", async (t) => {
  const root = await fixture({
    "interactive.md": "---\ntitle: Interactive\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\n---\nCanonical Interactive content.\n",
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let requestCount = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    requestCount += 1;
    return new Response(JSON.stringify(bridgePayload(45, undefined, undefined, init)), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const results = await publishControlledDiscussions(options(root));
  assert.equal(requestCount, 1);
  assert.equal(results.filter((result) => result.status !== "skipped").length, 1);
  const updated = await fs.readFile(path.join(root, "interactive.md"), "utf8");
  assert.match(updated, /discussionCommentsDisplay: interactive/);
  assert.match(updated, /discourseTopicId: "45"/);
});

test("Astro author frontmatter sends bounded primary and coauthor identities", async (t) => {
  const root = await fixture({
    "authored.md": `---
title: Authored page
discussionCommentsDisplay: interactive
discussionSync: true
authors:
  - id: astro:phil
    name: Phil
    profileUrl: https://site.example/authors/phil/
  - id: astro:editorial
    name: DiscussionBridge Editorial
primaryAuthor: astro:phil
---
Authored page content.
`,
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let bridgeRecord;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    bridgeRecord = JSON.parse(init.body).bridge_record;
    return new Response(JSON.stringify(bridgePayload(42, undefined, undefined, init)), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  await publishControlledDiscussions(options(root));
  assert.equal(bridgeRecord.primary_source_author_id, "astro:phil");
  assert.deepEqual(bridgeRecord.source_authors, [
    {
      id: "astro:phil",
      name: "Phil",
      profile_url: "https://site.example/authors/phil/",
    },
    { id: "astro:editorial", name: "DiscussionBridge Editorial" },
  ]);
});

test("author identities fail before fetch when malformed, duplicate, or outside the source origin", async (t) => {
  const cases = [
    "authors: [{ name: Missing ID }]",
    "authors: [{ id: astro:one, name: One }, { id: astro:one, name: Duplicate }]",
    "authors: [{ id: astro:one, name: One, profileUrl: https://attacker.invalid/one/ }]",
    "authors: [{ id: astro:one, name: One }]\nprimaryAuthor: astro:missing",
  ];
  let requests = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response(JSON.stringify(bridgePayload(43)), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  for (const [index, authors] of cases.entries()) {
    const root = await fixture({
      [`invalid-${index}.md`]: `---
title: Invalid author
discussionCommentsDisplay: interactive
discussionSync: true
${authors}
---
Invalid author content.
`,
    });
    try {
      await assert.rejects(() => publishControlledDiscussions(options(root)), /DiscussionBridge author|primary author/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
  assert.equal(requests, 0);
});

test("an existing local binding is authenticated again and mismatch never overwrites", async (t) => {
  const root = await fixture({
    "page.md": `---\ntitle: Bound\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\ndiscussionbridgeExternalId: ${EXTERNAL_ID}\ndiscussionbridgeResourceId: ${RESOURCE_ID}\ndiscourseTopicId: 40\ndiscourseTopicUrl: https://forum.example/community/t/bound/40\n---\nBound page content.\n`,
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const original = await fs.readFile(path.join(root, "page.md"), "utf8");
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => new Response(JSON.stringify(bridgePayload(41, "resolved", undefined, init)), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  t.after(() => { globalThis.fetch = previousFetch; });

  await assert.rejects(() => publishControlledDiscussions(options(root)), /different resource or topic than the stored mapping/);
  assert.equal(await fs.readFile(path.join(root, "page.md"), "utf8"), original);
});

test("a standalone Core embed pair is adopted without changing its topic identity", async (t) => {
  const root = await fixture({
    "page.md": `---\ntitle: Existing full embed\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\ndiscourseTopicId: 40\ndiscourseTopicUrl: https://forum.example/community/t/existing-full-embed/40\n---\nExisting page content.\n`,
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let requested;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    requested = JSON.parse(init.body).bridge_record;
    return new Response(JSON.stringify({
      ...bridgePayload(40, undefined, undefined, init),
      reason: "core_embed_topic_adopted",
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const [result] = await publishControlledDiscussions(options(root));
  assert.equal(requested.existing_topic_id, 40);
  assert.equal(result.topicId, 40);
  const updated = await fs.readFile(path.join(root, "page.md"), "utf8");
  assert.match(updated, /discussionbridgeExternalId: "astro-page:[0-9a-f]{64}"/);
  assert.match(updated, /discussionbridgeResourceId: "11111111-1111-4111-8111-111111111111"/);
  assert.match(updated, /discourseTopicId: "40"/);
});

test("a matching stored mapping is reauthenticated and a wrong-origin or internally inconsistent URL fails before request", async (t) => {
  const root = await fixture({
    "matching.md": `---\ntitle: Bound\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\ndiscussionbridgeExternalId: ${EXTERNAL_ID}\ndiscussionbridgeResourceId: ${RESOURCE_ID}\ndiscourseTopicId: 40\ndiscourseTopicUrl: https://forum.example/community/t/bound/40\n---\nBound page content.\n`,
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let requests = 0;
  let requestedExternalId;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    requests += 1;
    requestedExternalId = JSON.parse(init.body).bridge_record.external_id;
    return new Response(JSON.stringify(bridgePayload(40, "resolved", undefined, init)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  const [result] = await publishControlledDiscussions(options(root));
  assert.equal(requests, 1);
  assert.equal(result.status, "resolved");
  assert.equal(result.topicId, 40);
  assert.equal(requestedExternalId, EXTERNAL_ID);

  await fs.writeFile(path.join(root, "matching.md"), `---\ntitle: Bound\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\ndiscussionbridgeExternalId: ${EXTERNAL_ID}\ndiscussionbridgeResourceId: ${RESOURCE_ID}\ndiscourseTopicId: 40\ndiscourseTopicUrl: https://attacker.invalid/t/bound/40\n---\nBound page content.\n`);
  await assert.rejects(() => publishControlledDiscussions(options(root)), /left the configured Discourse origin/);
  assert.equal(requests, 1);

  await fs.writeFile(path.join(root, "matching.md"), `---\ntitle: Bound\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\ndiscussionbridgeExternalId: ${EXTERNAL_ID}\ndiscussionbridgeResourceId: ${RESOURCE_ID}\ndiscourseTopicId: 40\ndiscourseTopicUrl: https://forum.example/community/t/bound/41\n---\nBound page content.\n`);
  await assert.rejects(() => publishControlledDiscussions(options(root)), /topic ID and URL disagree/);
  assert.equal(requests, 1);
});

test("stored binding pairs must be wholly absent or wholly valid before any request", async (t) => {
  const invalid = {
    "invalid-external-only.md": "discussionbridgeExternalId: not-an-identity",
    "external-resource-only.md": `discussionbridgeExternalId: ${EXTERNAL_ID}\ndiscussionbridgeResourceId: ${RESOURCE_ID}`,
    "bad-external.md": `discussionbridgeExternalId: not-an-identity\ndiscussionbridgeResourceId: ${RESOURCE_ID}\ndiscourseTopicId: 40\ndiscourseTopicUrl: https://forum.example/community/t/bound/40`,
    "resource-only.md": `discussionbridgeResourceId: ${RESOURCE_ID}`,
    "id-only.md": "discourseTopicId: 40",
    "url-only.md": "discourseTopicUrl: https://forum.example/community/t/bound/40",
    "bad-resource.md": `discussionbridgeExternalId: ${EXTERNAL_ID}\ndiscussionbridgeResourceId: not-a-uuid\ndiscourseTopicId: 40\ndiscourseTopicUrl: https://forum.example/community/t/bound/40`,
    "zero-id.md": `discussionbridgeExternalId: ${EXTERNAL_ID}\ndiscussionbridgeResourceId: ${RESOURCE_ID}\ndiscourseTopicId: 0\ndiscourseTopicUrl: https://forum.example/community/t/bound/40`,
    "bogus-id.md": `discussionbridgeExternalId: ${EXTERNAL_ID}\ndiscussionbridgeResourceId: ${RESOURCE_ID}\ndiscourseTopicId: bogus\ndiscourseTopicUrl: https://forum.example/community/t/bound/40`,
    "blank-url.md": `discussionbridgeExternalId: ${EXTERNAL_ID}\ndiscussionbridgeResourceId: ${RESOURCE_ID}\ndiscourseTopicId: 40\ndiscourseTopicUrl: ""`,
    "object-url.md": `discussionbridgeExternalId: ${EXTERNAL_ID}\ndiscussionbridgeResourceId: ${RESOURCE_ID}\ndiscourseTopicId: 40\ndiscourseTopicUrl:\n  nested: value`,
  };
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error("must not request"); };
  t.after(() => { globalThis.fetch = previousFetch; });

  for (const [name, binding] of Object.entries(invalid)) {
    const root = await fixture({
      [name]: `---\ntitle: Invalid\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\n${binding}\n---\n`,
    });
    try {
      await assert.rejects(() => publishControlledDiscussions(options(root)));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
  assert.equal(requests, 0);
});

test("explicit prepublication external identity survives initial publication, retry and source edits and cannot replace a durable binding", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-explicit-");
  const file = path.join(root, "source.md");
  await fs.writeFile(file, `---\ntitle: Explicit stable identity\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\ndiscussionbridgeExternalId: ${EXTERNAL_ID}\n---\nNative source.\n`);
  const priorFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(init.body).bridge_record;
    requests.push(payload);
    assert.equal(payload.external_id, EXTERNAL_ID);
    return Response.json(bridgePayload(40, requests.length === 1 ? "created" : "resolved", RESOURCE_ID, init), { status: requests.length === 1 ? 201 : 200 });
  };
  t.after(() => { globalThis.fetch = priorFetch; });
  assert.equal((await publishControlledDiscussions(options(root)))[0].status, "created");
  assert.equal((await publishControlledDiscussions(options(root)))[0].status, "resolved");
  const published = await fs.readFile(file, "utf8");
  await fs.writeFile(file, published.replace("Native source.", "Source wiki or normal revision."));
  assert.equal((await publishControlledDiscussions(options(root)))[0].resourceId, RESOURCE_ID);
  assert.equal(requests.length, 3);
  assert.notEqual(requests[2].source_publication.revision, requests[0].source_publication.revision);
  assert.equal(requests[2].source_publication.previous_revision, requests[0].source_publication.revision);
  const editedBinding = (await fs.readFile(file, "utf8")).replace(EXTERNAL_ID, `astro-page:${"c".repeat(64)}`);
  await fs.writeFile(file, editedBinding);
  await assert.rejects(publishControlledDiscussions(options(root)), /external identity disagrees with durable native publication identity/u);
  assert.equal(requests.length, 3);
  assert.equal(await fs.readFile(file, "utf8"), editedBinding);
});

test("duplicate explicit prepublication external IDs fail the whole census before dispatch", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-explicit-");
  const source = `---\ntitle: Explicit stable identity\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\ndiscussionbridgeExternalId: ${EXTERNAL_ID}\n---\nNative source.\n`;
  await fs.writeFile(path.join(root, "first.md"), source);
  await fs.writeFile(path.join(root, "second.md"), source);
  const priorFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("must not request"); };
  t.after(() => { globalThis.fetch = priorFetch; });
  await assert.rejects(publishControlledDiscussions(options(root)), /share one stored.*identity/u);
  assert.equal(requests, 0);
});

test("the complete authorized corpus rejects stored external, resource and topic collisions before request or write", async (t) => {
  const otherExternalId = `astro-page:${"c".repeat(64)}`;
  const otherResourceId = "22222222-2222-4222-8222-222222222222";
  const page = (externalId, resourceId, topicId) => `---\ntitle: Bound native source\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\ndiscussionbridgeExternalId: ${externalId}\ndiscussionbridgeResourceId: ${resourceId}\ndiscourseTopicId: ${topicId}\ndiscourseTopicUrl: https://forum.example/community/t/bound/${topicId}\n---\nNative content.\n`;
  const priorFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("must not request"); };
  t.after(() => { globalThis.fetch = priorFetch; });
  for (const second of [page(EXTERNAL_ID, otherResourceId, 41), page(otherExternalId, RESOURCE_ID, 41), page(otherExternalId, otherResourceId, 40)]) {
    const root = await ownedTempFixture(t, "discussionbridge-astro-census-");
    const first = page(EXTERNAL_ID, RESOURCE_ID, 40);
    await fs.writeFile(path.join(root, "first.md"), first);
    await fs.writeFile(path.join(root, "second.md"), second);
    await assert.rejects(publishControlledDiscussions(options(root)), /share one stored.*identity/u);
    assert.equal(await fs.readFile(path.join(root, "first.md"), "utf8"), first);
    assert.equal(await fs.readFile(path.join(root, "second.md"), "utf8"), second);
  }
  assert.equal(requests, 0);
});

test("the complete authorized corpus rejects canonical source collisions before request or write", async (t) => {
  const source = "---\ntitle: Collision\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\n---\nCollision content.\n";
  const root = await fixture({ "foo.md": source, "foo/index.md": source });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let requests = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { requests += 1; throw new Error("must not request"); };
  t.after(() => { globalThis.fetch = previousFetch; });

  await assert.rejects(
    () => publishControlledDiscussions(options(root)),
    (error) => error.message.includes("foo.md") && error.message.includes(path.join("foo", "index.md")),
  );
  assert.equal(requests, 0);
  assert.equal(await fs.readFile(path.join(root, "foo.md"), "utf8"), source);
  assert.equal(await fs.readFile(path.join(root, "foo/index.md"), "utf8"), source);
});

test("routeBase is a contained relative prefix and preserves a site subpath", async (t) => {
  const source = "---\ntitle: Route\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\n---\nRoute content.\n";
  const root = await fixture({ "page.md": source });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (_url, init) => {
    requests += 1;
    const body = JSON.parse(init.body);
    assert.equal(body.bridge_record.canonical_url, "https://site.example/base/docs/page/");
    return new Response(JSON.stringify(bridgePayload(61, undefined, undefined, init)), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  await publishControlledDiscussions({ ...options(root), siteUrl: "https://site.example/base/", routeBase: "docs" });
  assert.equal(requests, 1);

  for (const routeBase of ["../escape", "%2e%2e/escape", "docs?x=1", "docs#x", "//host/path", "/absolute", "https:escape", "docs\\escape", "docs//escape"]) {
    await fs.writeFile(path.join(root, "page.md"), source);
    await assert.rejects(() => publishControlledDiscussions({ ...options(root), routeBase }));
  }
  assert.equal(requests, 1);
});

test("file routes and custom Astro slugs are safe canonical identities", async (t) => {
  const source = (extra = "") => `---\ntitle: Route\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\n${extra}---\nRoute content.\n`;
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (_url, init) => {
    requests += 1;
    const body = JSON.parse(init.body);
    assert.equal(body.bridge_record.canonical_url, "https://site.example/base/guides/custom-page/");
    return new Response(JSON.stringify(bridgePayload(71, undefined, undefined, init)), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const valid = await fixture({ "ordinary.md": source("slug: guides/custom-page\n") });
  try {
    await publishControlledDiscussions({ ...options(valid), siteUrl: "https://site.example/base/" });
  } finally {
    await fs.rm(valid, { recursive: true, force: true });
  }
  assert.equal(requests, 1);

  // Windows cannot create a literal `?` filename; the slug negatives below
  // exercise query syntax while these legal filenames exercise raw fragment
  // and percent semantics.
  for (const name of ["hash#page.md", "encoded%2e%2e.md"]) {
    const root = await fixture({ [name]: source() });
    try {
      await assert.rejects(() => publishControlledDiscussions(options(root)), /Markdown path/);
      assert.equal(await fs.readFile(path.join(root, name), "utf8"), source());
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
  for (const slug of ["../escape", "%2e%2e/escape", "docs?x=1", "docs#x", "//host/path", "/absolute", "https:escape", "docs\\escape", "docs//escape", ""]) {
    const root = await fixture({ "page.md": source(`slug: ${JSON.stringify(slug)}\n`) });
    try {
      await assert.rejects(() => publishControlledDiscussions(options(root)), /slug/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
  assert.equal(requests, 1);
});

test("file-derived and slug-derived canonical identities collide before mutation", async (t) => {
  const root = await fixture({
    "foo.md": "---\ntitle: File route\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\n---\nFile route content.\n",
    "other.md": "---\ntitle: Slug route\nslug: foo\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\n---\nSlug route content.\n",
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let requests = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { requests += 1; throw new Error("must not request"); };
  t.after(() => { globalThis.fetch = previousFetch; });
  await assert.rejects(
    () => publishControlledDiscussions(options(root)),
    (error) => error.message.includes("foo.md") && error.message.includes("other.md"),
  );
  assert.equal(requests, 0);
});

test("all local page validation completes before the first remote mutation", async (t) => {
  const root = await fixture({
    "a-valid.md": "---\ntitle: Valid\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\n---\nValid content.\n",
    "z-invalid.md": "---\ntitle: Invalid\nslug: ../escape\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\n---\nInvalid route content.\n",
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let requests = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { requests += 1; throw new Error("must not request"); };
  t.after(() => { globalThis.fetch = previousFetch; });
  await assert.rejects(() => publishControlledDiscussions(options(root)), /slug/);
  assert.equal(requests, 0);
});

test("controlled response validation fails closed and redacts credentials", async (t) => {
  const root = await fixture({
    "page.md": "---\ntitle: Bound\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\n---\nBound content.\n",
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });

  for (const response of [
    new Response("not json", { status: 200, headers: { "content-type": "text/plain" } }),
    new Response("{", { status: 200, headers: { "content-type": "application/json" } }),
    new Response(JSON.stringify({ outcome: "created", topic_id: 1, core_fallback: true }), { status: 200, headers: { "content-type": "application/json" } }),
    new Response(JSON.stringify({ outcome: "other", topic_id: 1, core_fallback: false }), { status: 200, headers: { "content-type": "application/json" } }),
    new Response(JSON.stringify({ outcome: "created", topic_id: 0, core_fallback: false }), { status: 200, headers: { "content-type": "application/json" } }),
  ]) {
    globalThis.fetch = async () => response.clone();
    await assert.rejects(() => publishControlledDiscussions(options(root)));
  }

  globalThis.fetch = async () => new Response(JSON.stringify({ outcome: "rejected", reason: `${CONNECTION_SECRET} ${CONNECTION_ID}`, core_fallback: false }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
  await assert.rejects(
    () => publishControlledDiscussions(options(root)),
    (error) => !error.message.includes(CONNECTION_SECRET) && !error.message.includes(CONNECTION_ID),
  );
});

test("atomic replacement preserves the original when rename fails", async (t) => {
  const root = await fixture({ "page.md": "original" });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = path.join(root, "page.md");
  await assert.rejects(() => replaceFileAtomically(target, "replacement", {
    open: fs.open.bind(fs),
    rename: async () => { throw new Error("injected rename failure"); },
    remove: fs.rm.bind(fs),
  }), /injected rename failure/);
  assert.equal(await fs.readFile(target, "utf8"), "original");
  assert.deepEqual((await fs.readdir(root)).sort(), ["page.md"]);
});

test("a failed atomic binding write can retry the same plugin mapping as resolved", async (t) => {
  const root = await fixture({
    "page.md": "---\ntitle: Retry\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\n---\nRetry content.\n",
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = path.join(root, "page.md");
  const original = await fs.readFile(target, "utf8");
  const outcomes = ["created", "resolved"];
  const correlations = [];
  let requests = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    correlations.push(JSON.parse(init.body).bridge_record.correlation_id);
    return new Response(JSON.stringify({
      ...bridgePayload(52, outcomes[requests++], undefined, init),
      reason: requests === 1 ? "bridge_record_created" : "existing_bridge_record",
    }), { status: requests === 1 ? 201 : 200, headers: { "content-type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  await assert.rejects(
    () => publishControlledDiscussions(options(root), {
      replaceFile: async () => { throw new Error("injected atomic rename failure"); },
    }),
    /injected atomic rename failure/,
  );
  assert.equal(await fs.readFile(target, "utf8"), original);
  const failedState = JSON.parse(await fs.readFile(options(root).stateFile, "utf8"));
  assert.equal(failedState.operations[Object.keys(failedState.operations)[0]].outcome, "reconciliation_required");
  assert.equal(failedState.operations[Object.keys(failedState.operations)[0]].attempts, 1);

  const [result] = await publishControlledDiscussions(options(root));
  assert.equal(requests, 2);
  assert.equal(correlations[0], correlations[1]);
  assert.equal(result.status, "resolved");
  assert.equal(result.topicId, 52);
  assert.match(await fs.readFile(target, "utf8"), /discourseTopicId: "52"/);
  const recoveredState = JSON.parse(await fs.readFile(options(root).stateFile, "utf8"));
  const operation = recoveredState.operations[Object.keys(recoveredState.operations)[0]];
  assert.equal(operation.outcome, "resolved");
  assert.equal(operation.attempts, 2);
  assert.equal(operation.resourceId, RESOURCE_ID);
  assert.equal(operation.topicId, 52);
  assert.equal(operation.reconciliationRequired, false);
  assert.doesNotMatch(JSON.stringify(recoveredState), new RegExp(CONNECTION_SECRET));
});

test("an interruption after remote success leaves pending state until the binding commits", async (t) => {
  const root = await fixture({
    "page.md": "---\ntitle: Interrupted\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\n---\nInterrupted content.\n",
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = path.join(root, "page.md");
  const correlations = [];
  let requests = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    correlations.push(JSON.parse(init.body).bridge_record.correlation_id);
    requests++;
    return new Response(JSON.stringify({
      ...bridgePayload(53, requests === 1 ? "created" : "resolved", undefined, init),
      reason: requests === 1 ? "bridge_record_created" : "existing_bridge_record",
    }), { status: requests === 1 ? 201 : 200, headers: { "content-type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  await assert.rejects(
    () => publishControlledDiscussions(options(root), {
      afterResultStaged: async () => { throw new Error("simulated process interruption"); },
    }),
    /simulated process interruption/,
  );
  assert.doesNotMatch(await fs.readFile(target, "utf8"), /discussionbridgeResourceId/);
  const interruptedState = JSON.parse(await fs.readFile(options(root).stateFile, "utf8"));
  const interrupted = interruptedState.operations[Object.keys(interruptedState.operations)[0]];
  assert.equal(interrupted.outcome, "pending");
  assert.equal(interrupted.retryable, true);
  assert.equal(interrupted.reconciliationRequired, true);
  assert.equal(interrupted.resourceId, RESOURCE_ID);
  assert.equal(interrupted.topicId, 53);

  const [result] = await publishControlledDiscussions(options(root));
  assert.equal(requests, 2);
  assert.equal(correlations[0], correlations[1]);
  assert.equal(result.status, "resolved");
  assert.match(await fs.readFile(target, "utf8"), /discourseTopicId: "53"/);
  const recoveredState = JSON.parse(await fs.readFile(options(root).stateFile, "utf8"));
  const recovered = recoveredState.operations[Object.keys(recoveredState.operations)[0]];
  assert.equal(recovered.outcome, "resolved");
  assert.equal(recovered.attempts, 2);
  assert.equal(recovered.reconciliationRequired, false);
});

test("overlapping publication builds fail closed on the shared state file", async (t) => {
  const root = await fixture({
    "page.md": "---\ntitle: Concurrent\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\n---\nConcurrent content.\n",
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let releaseFirst;
  const firstStaged = new Promise((resolve) => { releaseFirst = resolve; });
  let staged;
  const stagedReached = new Promise((resolve) => { staged = resolve; });
  let requests = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    requests++;
    return new Response(JSON.stringify(bridgePayload(54, "created", undefined, init)), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const first = publishControlledDiscussions(options(root), {
    afterResultStaged: async () => { staged(); await firstStaged; },
  });
  await stagedReached;
  await assert.rejects(
    () => publishControlledDiscussions(options(root)),
    /publication state is already in use/,
  );
  releaseFirst();
  const [result] = await first;
  assert.equal(requests, 1);
  assert.equal(result.status, "created");
  const state = JSON.parse(await fs.readFile(options(root).stateFile, "utf8"));
  assert.equal(Object.values(state.operations)[0].outcome, "created");
  await assert.rejects(() => fs.access(`${options(root).stateFile}.lock`), /ENOENT/);
});

test("a hard-killed owner is reclaimed once and retries the staged identity", async (t) => {
  const root = await fixture({
    "page.md": "---\ntitle: Hard kill\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\n---\nHard-kill content.\n",
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const child = spawn(process.execPath, [fileURLToPath(new URL("./hard-kill-publication-child.mjs", import.meta.url)), root], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const childIdentity = await firstJsonLine(child);
  const exited = once(child, "exit");
  assert.equal(child.kill("SIGKILL"), true);
  await exited;
  const interruptedState = JSON.parse(await fs.readFile(options(root).stateFile, "utf8"));
  assert.equal(Object.values(interruptedState.operations)[0].outcome, "pending");
  await new Promise((resolve) => setTimeout(resolve, 3_500));

  const correlations = [];
  let requests = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    requests++;
    correlations.push(JSON.parse(init.body).bridge_record.correlation_id);
    return new Response(JSON.stringify(bridgePayload(55, "resolved", undefined, init)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  let releaseWinner;
  const release = new Promise((resolve) => { releaseWinner = resolve; });
  let winnerEntered;
  const entered = new Promise((resolve) => { winnerEntered = resolve; });
  const winner = publishControlledDiscussions(options(root), {
    lockOptions: { staleMs: 2_000, updateMs: 1_000 },
    afterResultStaged: async () => { winnerEntered(); await release; },
  });
  await entered;
  await assert.rejects(
    () => publishControlledDiscussions(options(root), undefined),
    /publication state is already in use/,
  );
  releaseWinner();
  const [result] = await winner;
  assert.equal(requests, 1);
  assert.equal(correlations[0], childIdentity.correlationId);
  assert.equal(result.status, "resolved");
  const recoveredState = JSON.parse(await fs.readFile(options(root).stateFile, "utf8"));
  const recovered = Object.values(recoveredState.operations)[0];
  assert.equal(recovered.externalId, childIdentity.externalId);
  assert.equal(recovered.outcome, "resolved");
  assert.equal(recovered.attempts, 2);
  assert.match(await fs.readFile(path.join(root, "page.md"), "utf8"), /discourseTopicId: "55"/);
});

async function firstJsonLine(child) {
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  return new Promise((resolve, reject) => {
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline >= 0) {
        try { resolve(JSON.parse(buffer.slice(0, newline))); }
        catch (error) { reject(error); }
      }
    });
    child.once("exit", (code) => reject(new Error(`Lock child exited ${code}: ${stderr}`)));
    child.once("error", reject);
  });
}

test("response origin and both declared and streamed size limits are enforced", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const input = {
    discourseUrl: "https://forum.example/community/",
    options: {
      connectionId: CONNECTION_ID,
      connectionSecret: CONNECTION_SECRET,
      maxResponseBytes: 64,
    },
    sourceUrl: "https://site.example/page/",
    title: "Page",
    contentHtml: "<p>Page content.</p>",
  };

  globalThis.fetch = async () => {
    const response = new Response(JSON.stringify(bridgePayload(1)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    Object.defineProperty(response, "url", { value: "https://attacker.invalid/capture" });
    return response;
  };
  await assert.rejects(() => resolveControlledCreation(input), /left the configured Discourse origin/);

  globalThis.fetch = async () => new Response("{}", {
    status: 200,
    headers: { "content-type": "application/json", "content-length": "65" },
  });
  await assert.rejects(() => resolveControlledCreation(input), /size limit/);

  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("x".repeat(65)));
      controller.close();
    },
  }), { status: 200, headers: { "content-type": "application/json" } });
  await assert.rejects(() => resolveControlledCreation(input), /size limit/);
});

test("connection identity, lane, and visibility are runtime validated before fetch", async (t) => {
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error("must not request"); };
  t.after(() => { globalThis.fetch = previousFetch; });
  const base = {
    discourseUrl: "https://forum.example/",
    sourceUrl: "https://site.example/page/",
    title: "Page",
    contentHtml: "<p>Page content.</p>",
  };
  for (const options of [
    { connectionId: " bad", connectionSecret: CONNECTION_SECRET },
    { connectionId: "x".repeat(101), connectionSecret: CONNECTION_SECRET },
    { connectionId: CONNECTION_ID, connectionSecret: "s".repeat(31) },
    { connectionId: CONNECTION_ID, connectionSecret: "é".repeat(129) },
    { connectionId: CONNECTION_ID, connectionSecret: `${"s".repeat(32)}\n` },
    { connectionId: CONNECTION_ID, connectionSecret: CONNECTION_SECRET, lane: "Bad Lane" },
    { connectionId: CONNECTION_ID, connectionSecret: CONNECTION_SECRET, visibility: "private" },
  ]) {
    await assert.rejects(() => resolveControlledCreation({ ...base, options }));
  }
  assert.equal(requests, 0);
});

test("direct controlled creation enforces source and title bounds before fetch", async (t) => {
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error("must not request"); };
  t.after(() => { globalThis.fetch = previousFetch; });
  const base = {
    discourseUrl: "https://forum.example/",
    options: { connectionId: CONNECTION_ID, connectionSecret: CONNECTION_SECRET },
    sourceUrl: "https://site.example/page/",
    title: "Page",
    contentHtml: "<p>Page content.</p>",
  };
  for (const input of [
    { ...base, sourceUrl: "https://site.example/%2e%2e/private" },
    { ...base, sourceUrl: `https://site.example/${"x".repeat(2_048)}` },
    { ...base, title: "x".repeat(1_025) },
    { ...base, externalId: "not-an-astro-page-identity" },
    { ...base, existingTopicId: 0 },
    { ...base, existingTopicId: Number.MAX_SAFE_INTEGER + 1 },
    { ...base, contentHtml: "" },
    { ...base, contentHtml: "x".repeat((48 * 1024) + 1) },
    ...[{ nested: "not-a-string" }, ["not-a-string"], 42, true, null].map((contentHtml) => ({ ...base, contentHtml })),
    ...[{ nested: "not-a-string" }, ["not-a-string"], 42, true, null].map((title) => ({ ...base, title })),
  ]) {
    await assert.rejects(() => resolveControlledCreation(input));
  }
  assert.equal(requests, 0);
});

test("complete native source editions use directional excerpts and preserve accepted CAS state on updates", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-editions-");
  const file = path.join(root, "source.md");
  const source = `---\ntitle: Complete source\ndate: 2026-08-01T08:00:00Z\nlastUpdated: 2026-09-02T08:00:00Z\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\n---\n\n${"Full native source & useful content. ".repeat(5000)}ENDING\n`;
  await fs.writeFile(file, source);
  const previousFetch = globalThis.fetch;
  const publications = [];
  globalThis.fetch = async (_url, init) => {
    const record = JSON.parse(init.body).bridge_record;
    publications.push(record);
    assert.ok(Buffer.byteLength(init.body) <= 65536);
    assert.ok(Buffer.byteLength(record.content_html) <= 49152);
    return new Response(JSON.stringify(bridgePayload(71, publications.length === 1 ? "created" : "resolved", undefined, init)), { status: 200, headers: { "content-type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  await publishControlledDiscussions(options(root));
  const initial = publications[0].source_publication;
  assert.equal(initial.previous_revision, null);
  assert.equal(initial.excerpted, true);
  assert.ok(initial.content_bytes > 65536);
  assert.equal(initial.created_at, "2026-08-01T08:00:00Z");
  assert.match(publications[0].content_html, /Read More/);
  assert.match(publications[0].content_html, /https:\/\/site.example\/source\//);
  assert.match(await fs.readFile(file, "utf8"), /ENDING/);
  await publishControlledDiscussions(options(root));
  assert.equal(publications[1].source_publication.revision, initial.revision);
  assert.equal(publications[1].source_publication.previous_revision, initial.revision);
  const saved = await fs.readFile(file, "utf8");
  await fs.writeFile(file, saved.replace("title: Complete source", "title: Edited title"));
  await publishControlledDiscussions(options(root));
  assert.notEqual(publications[2].source_publication.revision, initial.revision);
  assert.equal(publications[2].source_publication.previous_revision, initial.revision);
  const state = JSON.parse(await fs.readFile(options(root).stateFile, "utf8"));
  assert.equal(Object.values(state.operations)[0].sourceRevision, publications[2].source_publication.revision);
});

test("a source publication response missing accepted revision cannot commit the binding", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-editions-");
  const file = path.join(root, "source.md");
  const source = "---\ntitle: Source\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\n---\nSource body.\n";
  await fs.writeFile(file, source);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(bridgePayload(71)), { status: 200, headers: { "content-type": "application/json" } });
  t.after(() => { globalThis.fetch = previousFetch; });
  await assert.rejects(() => publishControlledDiscussions(options(root)), /did not confirm/);
  assert.equal(await fs.readFile(file, "utf8"), source);
});
