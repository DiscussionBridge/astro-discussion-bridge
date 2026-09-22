import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { astroPlatformCatalog, finalizeAstroPublicationWork, prepareAstroPublicationWork } from "../dist/publication-work.js";

const resourceId = "11111111-1111-4111-8111-111111111111";
const publicationRevision = "a".repeat(64);
const mappingRevision = "b".repeat(64);
const leaseToken = "c".repeat(64);

test("Astro advertises a receiver-supported native collection", () => {
  const catalog = astroPlatformCatalog([{ id: "pledge", label: "Pledge", path: "/sections/pledge/" }]);
  assert.equal(catalog.containers[0].kind, "collection");
  assert.equal(catalog.containers[0].id, "topics");
  assert.deepEqual(catalog.containers[0].taxonomy_ids, ["section"]);
  assert.equal(catalog.taxonomies[0].terms[0].id, "pledge");
});

function sourceTopic() {
  return {
    topic_id: 53,
    topic_url: "https://bridge.example.com/t/forum-scale-publishing/53",
    title: "Forum scale publishing",
    source_revision: "post:99:version:2",
    source_created_at: "2026-09-19T16:00:00.000Z",
    source_updated_at: "2026-09-20T17:00:00.000Z",
    author: { name: "Forum Author" },
    publication: {},
    publication_revision: publicationRevision,
    destination: {
      state: "ready",
      destination_container_id: "topics",
      destination_terms: [{ destination_taxonomy_id: "section", destination_term_id: "pledge" }],
      destination_author_id: "astro:build",
      mapping_revision: mappingRevision,
    },
    content_html: "<h2>Forum source</h2>\n<p>Published natively.</p>",
  };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function options(root, fetchImplementation) {
  return {
    docsDir: path.join(root, "content"),
    stateFile: path.join(root, "protected", "publication-work.json"),
    siteUrl: "https://astro.example.com/",
    serverUrl: "https://bridge.example.com/",
    connectionId: "dbc_0123456789abcdef01234567",
    connectionSecret: "s".repeat(44),
    lane: "astro-obbba",
    sections: [{ id: "pledge", label: "Pledge", path: "/sections/pledge/" }],
    fetchImplementation,
  };
}

test("Astro claims, prepares, publicly verifies, and acknowledges one static publication", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "discussionbridge-astro-work-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let claims = 0;
  const acknowledgements = [];
  const fetchImplementation = async (url, init = {}) => {
    const parsed = new URL(url);
    if (parsed.origin === "https://astro.example.com") {
      const html = `<span hidden data-discussionbridge-resource-id="${resourceId}" data-discussionbridge-publication-revision="${publicationRevision}"></span>`;
      return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    }
    if (parsed.pathname.endsWith("/platform-catalog.json") && init.method === "GET") return json({ catalog_revision: null });
    if (parsed.pathname.endsWith("/platform-catalog.json") && init.method === "PUT") return json({ destination_mapping_state: "current" });
    if (parsed.pathname.endsWith("/publication-work/claim.json")) return json({ publication_work: claims++ === 0 ? {
      topic_id: 53,
      action: "publish",
      source_revision: "post:99:version:2",
      publication_revision: publicationRevision,
      lease_token: leaseToken,
      lease_expires_at: "2099-09-20T18:00:00.000Z",
    } : null });
    if (parsed.pathname.endsWith("/source-topics/53.json") && init.method === "GET") return json({ eligible: true, source_topic: sourceTopic() });
    if (parsed.pathname.endsWith("/source-topics/53/resolve.json")) {
      const body = JSON.parse(init.body);
      return json({ outcome: "created", resource_id: resourceId, external_id: body.publication.external_id, canonical_url: body.publication.canonical_url });
    }
    if (parsed.pathname.endsWith(`/bridge-records/${resourceId}/acknowledgement.json`)) {
      acknowledgements.push(JSON.parse(init.body).acknowledgement);
      return json({ outcome: "acknowledged", resource_id: resourceId });
    }
    throw new Error(`Unexpected request ${init.method} ${url}`);
  };
  const configured = options(root, fetchImplementation);
  assert.deepEqual(await prepareAstroPublicationWork(configured), {
    claimed: 1, created: 1, updated: 0, unchanged: 0, unpublished: 0, failed: 0,
    errors: [], requires_build: true, requires_finalize: true,
  });
  const file = path.join(root, "content", "topics", "forum-scale-publishing-53.md");
  const contents = await readFile(file, "utf8");
  assert.match(contents, /date: "2026-09-19T16:00:00.000Z"/u);
  assert.match(contents, /lastUpdated: "2026-09-20T17:00:00.000Z"/u);
  assert.match(contents, /discussionbridgeSection: pledge/u);
  assert.match(contents, new RegExp(resourceId));
  assert.doesNotMatch(contents, /dbc_012345|ssssssss/u);

  assert.deepEqual(await finalizeAstroPublicationWork(configured), {
    acknowledged: 1, unchanged: 0, failed: 0, errors: [],
  });
  assert.equal(acknowledgements[0].lease_token, leaseToken);
  assert.equal(acknowledgements[0].outcome, "created");
});

test("Astro accumulates valid pending work up to one larger build batch", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "discussionbridge-astro-batch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stateFile = path.join(root, "protected", "publication-work.json");
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, `${JSON.stringify({ schema_version: 1, publications: { "52": {
    topic_id: 52,
    resource_id: "22222222-2222-4222-8222-222222222222",
    external_id: "astro:topic:52",
    canonical_url: "https://astro.example.com/topics/existing-52/",
    file: "topics/existing-52.md",
    publication_revision: "d".repeat(64),
    outcome: "created",
    state: "pending_publish",
    lease_token: "e".repeat(64),
    lease_expires_at: "2099-09-20T18:00:00.000Z",
  } } }, null, 2)}\n`);
  let claims = 0;
  const fetchImplementation = async (url, init = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/platform-catalog.json") && init.method === "GET") return json({ catalog_revision: null });
    if (parsed.pathname.endsWith("/platform-catalog.json") && init.method === "PUT") return json({ destination_mapping_state: "current" });
    if (parsed.pathname.endsWith("/publication-work/claim.json")) return json({ publication_work: claims++ === 0 ? {
      topic_id: 53,
      action: "publish",
      source_revision: "post:99:version:2",
      publication_revision: publicationRevision,
      lease_token: leaseToken,
      lease_expires_at: "2099-09-20T18:00:00.000Z",
    } : null });
    if (parsed.pathname.endsWith("/source-topics/53.json")) return json({ eligible: true, source_topic: sourceTopic() });
    if (parsed.pathname.endsWith("/source-topics/53/resolve.json")) return json({
      outcome: "created",
      resource_id: resourceId,
      external_id: "astro:topic:53",
      canonical_url: "https://astro.example.com/topics/forum-scale-publishing-53/",
    });
    throw new Error(`Unexpected request ${init.method} ${url}`);
  };
  const configured = { ...options(root, fetchImplementation), maximum: 2 };
  const result = await prepareAstroPublicationWork(configured);
  assert.equal(result.claimed, 1);
  assert.equal(result.created, 1);
  assert.equal(result.requires_build, true);
  assert.equal(result.requires_finalize, true);
  const state = JSON.parse(await readFile(stateFile, "utf8"));
  assert.equal(Object.values(state.publications).filter((item) => item.state === "pending_publish").length, 2);
});

test("Astro bounds larger build batches and request pacing", async () => {
  await assert.rejects(
    prepareAstroPublicationWork({ ...options("unused", async () => json({})), maximum: 201 }),
    /Invalid publication work limit/u,
  );
  await assert.rejects(
    prepareAstroPublicationWork({ ...options("unused", async () => json({})), requestDelayMs: 5001 }),
    /Invalid DiscussionBridge request delay/u,
  );
});

test("Astro refuses to overwrite a platform-side edit", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "discussionbridge-astro-drift-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let claims = 0;
  let failures = 0;
  const fetchImplementation = async (url, init = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/platform-catalog.json") && init.method === "GET") return json({ catalog_revision: null });
    if (parsed.pathname.endsWith("/platform-catalog.json") && init.method === "PUT") return json({ destination_mapping_state: "current" });
    if (parsed.pathname.endsWith("/publication-work/claim.json")) return json({ publication_work: claims++ % 2 === 0 ? {
      topic_id: 53,
      action: "publish",
      source_revision: "post:99:version:2",
      publication_revision: publicationRevision,
      lease_token: leaseToken,
      lease_expires_at: "2099-09-20T18:00:00.000Z",
    } : null });
    if (parsed.pathname.endsWith("/source-topics/53.json")) return json({ eligible: true, source_topic: sourceTopic() });
    if (parsed.pathname.endsWith("/source-topics/53/resolve.json")) return json({ outcome: "created", resource_id: resourceId, external_id: "astro:topic:53", canonical_url: "https://astro.example.com/topics/forum-scale-publishing-53/" });
    if (parsed.pathname.endsWith("/publication-work/failure.json")) { failures++; return json({ outcome: "recorded" }); }
    throw new Error(`Unexpected request ${init.method} ${url}`);
  };
  const configured = options(root, fetchImplementation);
  await prepareAstroPublicationWork(configured);
  const stateFile = configured.stateFile;
  const state = JSON.parse(await readFile(stateFile, "utf8"));
  state.publications["53"].state = "healthy";
  delete state.publications["53"].lease_token;
  delete state.publications["53"].lease_expires_at;
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  const file = path.join(root, "content", "topics", "forum-scale-publishing-53.md");
  await writeFile(file, `${await readFile(file, "utf8")}\nOperator edit\n`);

  const result = await prepareAstroPublicationWork(configured);
  assert.equal(result.failed, 1);
  assert.equal(failures, 1);
  assert.match(result.errors[0].reason, /changed outside DiscussionBridge/u);
});

test("Astro removes a revoked native page and acknowledges only after public absence", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "discussionbridge-astro-unpublish-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const docsDir = path.join(root, "content");
  const stateFile = path.join(root, "protected", "publication-work.json");
  const file = path.join(docsDir, "topics", "forum-scale-publishing-53.md");
  await mkdir(path.dirname(file), { recursive: true });
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(file, "published native page\n");
  await writeFile(stateFile, `${JSON.stringify({ schema_version: 1, publications: { "53": {
    topic_id: 53,
    resource_id: resourceId,
    external_id: "astro:topic:53",
    canonical_url: "https://astro.example.com/topics/forum-scale-publishing-53/",
    file: "topics/forum-scale-publishing-53.md",
    publication_revision: "9".repeat(64),
    outcome: "created",
    state: "healthy",
  } } }, null, 2)}\n`);
  let claims = 0;
  const acknowledgements = [];
  const fetchImplementation = async (url, init = {}) => {
    const parsed = new URL(url);
    if (parsed.origin === "https://astro.example.com") return new Response("missing", { status: 404 });
    if (parsed.pathname.endsWith("/platform-catalog.json") && init.method === "GET") return json({ catalog_revision: null });
    if (parsed.pathname.endsWith("/platform-catalog.json") && init.method === "PUT") return json({ destination_mapping_state: "current" });
    if (parsed.pathname.endsWith("/publication-work/claim.json")) return json({ publication_work: claims++ === 0 ? {
      topic_id: 53,
      resource_id: resourceId,
      action: "unpublish",
      publication_revision: publicationRevision,
      lease_token: leaseToken,
      lease_expires_at: "2099-09-20T18:00:00.000Z",
    } : null });
    if (parsed.pathname.endsWith(`/source-revocations/${resourceId}.json`)) return json({ revoked: true, publication_revocation: { topic_id: 53, publication_revision: publicationRevision } });
    if (parsed.pathname.endsWith(`/bridge-records/${resourceId}/acknowledgement.json`)) {
      acknowledgements.push(JSON.parse(init.body).acknowledgement);
      return json({ outcome: "acknowledged", resource_id: resourceId });
    }
    throw new Error(`Unexpected request ${init.method} ${url}`);
  };
  const configured = options(root, fetchImplementation);
  assert.equal((await prepareAstroPublicationWork(configured)).unpublished, 1);
  await assert.rejects(readFile(file, "utf8"), { code: "ENOENT" });
  assert.equal((await finalizeAstroPublicationWork(configured)).acknowledged, 1);
  assert.equal(acknowledgements[0].outcome, "unpublished");
  assert.equal(acknowledgements[0].lease_token, leaseToken);
});
