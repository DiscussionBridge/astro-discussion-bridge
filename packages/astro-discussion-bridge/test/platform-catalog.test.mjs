import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fetchAstroCatalogPage, publishAstroCatalog } from "../dist/platform-catalog.js";

const fixture = async (name) => JSON.parse(await readFile(
  new URL(`../node_modules/discussionbridge-adapter-contract/fixtures/${name}`, import.meta.url),
  "utf8",
));
const capabilityBase = await fixture("connection-capability.json");
const containersBase = await fixture("platform-catalog-containers.json");
const credentialsBase = {
  discourseUrl: "https://forum.example/",
  connectionId: capabilityBase.connection_id,
  connectionSecret: "s".repeat(40),
};

function capability(correlationId) {
  return {
    ...structuredClone(capabilityBase),
    destination_policies: capabilityBase.destination_policies.map((policy) => ({ ...policy, profile: "astro" })),
    correlation_id: correlationId,
  };
}

function response(payload, correlationId) {
  return new Response(JSON.stringify({ ...payload, correlation_id: correlationId }), {
    status: 200,
    headers: { "content-type": "application/json", "X-DiscussionBridge-Correlation": correlationId },
  });
}

test("Astro catalog reads and replaces only exact descriptive bounded segments", async () => {
  const requests = [];
  const fetchImplementation = async (url, init) => {
    const parsed = new URL(url);
    const correlationId = init.headers["X-DiscussionBridge-Correlation"];
    requests.push({ parsed, init });
    if (parsed.pathname.endsWith("/connection.json")) return response(capability(correlationId), correlationId);
    if (init.method === "GET") return response({
      ...structuredClone(containersBase),
      catalog_revision: "catalog:astro:1",
      platform_profile: "astro",
      items: [{ id: "astro:collection:docs", name: "Documentation", kind: "content_collection", available: true }],
    }, correlationId);
    const body = JSON.parse(init.body);
    assert.equal(body.platform_profile, "astro");
    assert.equal(body.base_catalog_revision, "catalog:astro:1");
    assert.deepEqual(body.segments.map((segment) => segment.segment_type), ["presentation_modes", "native_limits"]);
    return response({
      catalog_revision: "catalog:astro:2",
      platform_profile: "astro",
      accepted_segments: ["presentation_modes", "native_limits"],
    }, correlationId);
  };
  const credentials = { ...credentialsBase, fetchImplementation };
  const page = await fetchAstroCatalogPage(credentials, { segmentType: "containers", catalogRevision: "catalog:astro:1", limit: 100 });
  assert.equal(page.items[0].id, "astro:collection:docs");
  const result = await publishAstroCatalog(credentials, {
    baseCatalogRevision: page.catalogRevision,
    segments: [
      {
        segmentType: "presentation_modes",
        items: [
          { id: "simple", name: "Simple", available: true },
          { id: "full", name: "Full", available: true },
          { id: "interactive", name: "Interactive", available: true },
        ],
      },
      {
        segmentType: "native_limits",
        items: [{ id: "astro:rendered-html", name: "Rendered HTML", maximum_bytes: 20_000_000, overflow_behavior: "excerpt_with_read_more", available: true }],
      },
    ],
  });
  assert.equal(result.catalogRevision, "catalog:astro:2");
  assert.equal(requests.length, 4);
});

test("Astro catalog rejects legacy presentation vocabulary, duplicates, and resume drift before authority can expand", async () => {
  const fetchImplementation = async (url, init) => {
    const parsed = new URL(url);
    const correlationId = init.headers["X-DiscussionBridge-Correlation"];
    if (parsed.pathname.endsWith("/connection.json")) return response(capability(correlationId), correlationId);
    return response({
      ...structuredClone(containersBase),
      catalog_revision: "catalog:astro:2",
      platform_profile: "astro",
      items: [{ id: "astro:collection:docs", name: "Documentation", kind: "content_collection", available: true }],
    }, correlationId);
  };
  const credentials = { ...credentialsBase, fetchImplementation };
  await assert.rejects(() => fetchAstroCatalogPage(credentials, { segmentType: "containers", catalogRevision: "catalog:astro:1" }), /revision changed/);
  await assert.rejects(() => publishAstroCatalog(credentials, {
    baseCatalogRevision: "catalog:astro:1",
    segments: [{ segmentType: "presentation_modes", items: [{ id: "fullInteractive", name: "Legacy", available: true }] }],
  }), /presentation mode/);
  await assert.rejects(() => publishAstroCatalog(credentials, {
    baseCatalogRevision: "catalog:astro:1",
    segments: [
      { segmentType: "authors", items: [] },
      { segmentType: "authors", items: [] },
    ],
  }), /duplicated/);
});
