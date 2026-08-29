import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  publishControlledDiscussions,
  replaceFileAtomically,
  resolveControlledCreation,
} from "../dist/controlled-creation.js";

const CONNECTION_ID = "dbc_aaaaaaaaaaaaaaaaaaaaaaaa";
const CONNECTION_SECRET = "s".repeat(32);
const RESOURCE_ID = "11111111-1111-4111-8111-111111111111";

function bridgePayload(topicId, outcome = "created", resourceId = RESOURCE_ID) {
  return {
    outcome,
    reason: outcome === "created" ? "bridge_record_created" : "existing_bridge_record",
    resource_id: resourceId,
    topic_id: topicId,
    topic_url: `https://forum.example/community/t/example/${topicId}`,
    direction: "to_discourse",
    core_fallback: false,
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
    siteUrl: "https://site.example/",
    discourseUrl: "https://forum.example/community/",
    controlledCreation: {
      connectionId: CONNECTION_ID,
      connectionSecret: CONNECTION_SECRET,
      lane: "docs",
    },
  };
}

test("only explicitly authorized published fullInteractive pages make a controlled request", async (t) => {
  const root = await fixture({
    "authorized.md": "---\ntitle: Authorized\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\n---\n# Authorized\n\nMeaningful **Astro** content.\n\n<script>unsafe()</script>\n",
    "omitted.md": "---\ndiscussionCommentsDisplay: fullInteractive\n---\n",
    "false.md": "---\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: false\n---\n",
    "string-false.md": "---\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: \"true\"\n---\n",
    "draft.md": "---\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\ndraft: true\n---\n",
    "draft-string.md": "---\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\ndraft: \"true\"\n---\n",
    "unpublished.md": "---\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\npublished: false\n---\n",
    "published-string.md": "---\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\npublished: \"false\"\n---\n",
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const requests = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify(bridgePayload(41)), {
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
  assert.deepEqual(
    Object.keys(body.bridge_record).sort(),
    ["adapter_id", "adapter_version", "canonical_url", "content_html", "correlation_id", "direction", "external_id", "lane", "published", "title", "visibility"].sort(),
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
  assert.match(updated, /discussionbridgeResourceId: "11111111-1111-4111-8111-111111111111"/);
  assert.match(updated, /discourseTopicId: "41"/);
  assert.match(updated, /discourseTopicUrl: "https:\/\/forum\.example\/community\/t\/example\/41"/);
});

test("an existing local binding is authenticated again and mismatch never overwrites", async (t) => {
  const root = await fixture({
    "page.md": `---\ntitle: Bound\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\ndiscussionbridgeResourceId: ${RESOURCE_ID}\ndiscourseTopicId: 40\ndiscourseTopicUrl: https://forum.example/community/t/bound/40\n---\nBound page content.\n`,
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const original = await fs.readFile(path.join(root, "page.md"), "utf8");
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(bridgePayload(41, "resolved")), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  t.after(() => { globalThis.fetch = previousFetch; });

  await assert.rejects(() => publishControlledDiscussions(options(root)), /different resource or topic than the stored mapping/);
  assert.equal(await fs.readFile(path.join(root, "page.md"), "utf8"), original);
});

test("a matching stored mapping is reauthenticated and a wrong-origin or internally inconsistent URL fails before request", async (t) => {
  const root = await fixture({
    "matching.md": `---\ntitle: Bound\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\ndiscussionbridgeResourceId: ${RESOURCE_ID}\ndiscourseTopicId: 40\ndiscourseTopicUrl: https://forum.example/community/t/bound/40\n---\nBound page content.\n`,
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let requests = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response(JSON.stringify(bridgePayload(40, "resolved")), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  const [result] = await publishControlledDiscussions(options(root));
  assert.equal(requests, 1);
  assert.equal(result.status, "resolved");
  assert.equal(result.topicId, 40);

  await fs.writeFile(path.join(root, "matching.md"), `---\ntitle: Bound\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\ndiscussionbridgeResourceId: ${RESOURCE_ID}\ndiscourseTopicId: 40\ndiscourseTopicUrl: https://attacker.invalid/t/bound/40\n---\nBound page content.\n`);
  await assert.rejects(() => publishControlledDiscussions(options(root)), /left the configured Discourse origin/);
  assert.equal(requests, 1);

  await fs.writeFile(path.join(root, "matching.md"), `---\ntitle: Bound\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\ndiscussionbridgeResourceId: ${RESOURCE_ID}\ndiscourseTopicId: 40\ndiscourseTopicUrl: https://forum.example/community/t/bound/41\n---\nBound page content.\n`);
  await assert.rejects(() => publishControlledDiscussions(options(root)), /topic ID and URL disagree/);
  assert.equal(requests, 1);
});

test("stored binding pairs must be wholly absent or wholly valid before any request", async (t) => {
  const invalid = {
    "resource-only.md": `discussionbridgeResourceId: ${RESOURCE_ID}`,
    "id-only.md": "discourseTopicId: 40",
    "url-only.md": "discourseTopicUrl: https://forum.example/community/t/bound/40",
    "bad-resource.md": "discussionbridgeResourceId: not-a-uuid\ndiscourseTopicId: 40\ndiscourseTopicUrl: https://forum.example/community/t/bound/40",
    "zero-id.md": `discussionbridgeResourceId: ${RESOURCE_ID}\ndiscourseTopicId: 0\ndiscourseTopicUrl: https://forum.example/community/t/bound/40`,
    "bogus-id.md": `discussionbridgeResourceId: ${RESOURCE_ID}\ndiscourseTopicId: bogus\ndiscourseTopicUrl: https://forum.example/community/t/bound/40`,
    "blank-url.md": `discussionbridgeResourceId: ${RESOURCE_ID}\ndiscourseTopicId: 40\ndiscourseTopicUrl: ""`,
    "object-url.md": `discussionbridgeResourceId: ${RESOURCE_ID}\ndiscourseTopicId: 40\ndiscourseTopicUrl:\n  nested: value`,
  };
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error("must not request"); };
  t.after(() => { globalThis.fetch = previousFetch; });

  for (const [name, binding] of Object.entries(invalid)) {
    const root = await fixture({
      [name]: `---\ntitle: Invalid\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\n${binding}\n---\n`,
    });
    try {
      await assert.rejects(() => publishControlledDiscussions(options(root)));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
  assert.equal(requests, 0);
});

test("the complete authorized corpus rejects canonical source collisions before request or write", async (t) => {
  const source = "---\ntitle: Collision\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\n---\nCollision content.\n";
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
  const source = "---\ntitle: Route\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\n---\nRoute content.\n";
  const root = await fixture({ "page.md": source });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (_url, init) => {
    requests += 1;
    const body = JSON.parse(init.body);
    assert.equal(body.bridge_record.canonical_url, "https://site.example/base/docs/page/");
    return new Response(JSON.stringify(bridgePayload(61)), {
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
  const source = (extra = "") => `---\ntitle: Route\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\n${extra}---\nRoute content.\n`;
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (_url, init) => {
    requests += 1;
    const body = JSON.parse(init.body);
    assert.equal(body.bridge_record.canonical_url, "https://site.example/base/guides/custom-page/");
    return new Response(JSON.stringify(bridgePayload(71)), {
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
    "foo.md": "---\ntitle: File route\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\n---\nFile route content.\n",
    "other.md": "---\ntitle: Slug route\nslug: foo\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\n---\nSlug route content.\n",
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
    "a-valid.md": "---\ntitle: Valid\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\n---\nValid content.\n",
    "z-invalid.md": "---\ntitle: Invalid\nslug: ../escape\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\n---\nInvalid route content.\n",
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
    "page.md": "---\ntitle: Bound\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\n---\nBound content.\n",
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
    "page.md": "---\ntitle: Retry\ndiscussionCommentsDisplay: fullInteractive\ndiscussionSync: true\n---\nRetry content.\n",
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = path.join(root, "page.md");
  const original = await fs.readFile(target, "utf8");
  const outcomes = ["created", "resolved"];
  let requests = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    ...bridgePayload(52, outcomes[requests++]),
    reason: requests === 1 ? "bridge_record_created" : "existing_bridge_record",
  }), { status: requests === 1 ? 201 : 200, headers: { "content-type": "application/json" } });
  t.after(() => { globalThis.fetch = previousFetch; });

  await assert.rejects(
    () => publishControlledDiscussions(options(root), {
      replaceFile: async () => { throw new Error("injected atomic rename failure"); },
    }),
    /injected atomic rename failure/,
  );
  assert.equal(await fs.readFile(target, "utf8"), original);

  const [result] = await publishControlledDiscussions(options(root));
  assert.equal(requests, 2);
  assert.equal(result.status, "resolved");
  assert.equal(result.topicId, 52);
  assert.match(await fs.readFile(target, "utf8"), /discourseTopicId: "52"/);
});

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
    { ...base, contentHtml: "" },
    { ...base, contentHtml: "x".repeat((48 * 1024) + 1) },
    ...[{ nested: "not-a-string" }, ["not-a-string"], 42, true, null].map((contentHtml) => ({ ...base, contentHtml })),
    ...[{ nested: "not-a-string" }, ["not-a-string"], 42, true, null].map((title) => ({ ...base, title })),
  ]) {
    await assert.rejects(() => resolveControlledCreation(input));
  }
  assert.equal(requests, 0);
});
