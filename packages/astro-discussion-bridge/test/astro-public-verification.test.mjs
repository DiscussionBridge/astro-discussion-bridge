import assert from "node:assert/strict";
import test from "node:test";
import { createAstroPublicVerifier } from "../dist/astro-public-verification.js";

const work = {
  resourceId: "11111111-1111-4111-8111-111111111111",
  sourceRevision: "post:149:version:2",
};
const destinationBinding = {
  canonicalUrl: "https://site.example/base/topics/example-53/",
};

test("Astro public verifier requires exact live resource and source revision markers", async () => {
  const requests = [];
  const verify = createAstroPublicVerifier({
    siteUrl: "https://site.example/base/",
    now: () => new Date("2026-09-28T17:30:00Z"),
    fetchImplementation: async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(`<html><body><div data-discussionbridge-resource-id="${work.resourceId}" data-discussionbridge-source-revision="${work.sourceRevision}"></div></body></html>`, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  });
  assert.deepEqual(await verify({ work, destinationBinding }), { publiclyVerifiedAt: "2026-09-28T17:30:00.000Z" });
  assert.equal(requests[0].init.redirect, "error");
  assert.equal(requests[0].init.credentials, "omit");
});

test("Astro public verifier rejects wrong site, stale identity, and bounded bodies", async () => {
  const outside = createAstroPublicVerifier({ siteUrl: "https://site.example/base/", fetchImplementation: async () => { throw new Error("must not fetch"); } });
  await assert.rejects(() => outside({ work, destinationBinding: { canonicalUrl: "https://other.example/base/topics/example/" } }), /outside the configured site/);

  const stale = createAstroPublicVerifier({ siteUrl: "https://site.example/base/", fetchImplementation: async () => new Response("<html>stale</html>", { status: 200, headers: { "content-type": "text/html" } }) });
  await assert.rejects(() => stale({ work, destinationBinding }), /resource identity is stale/);

  const oversized = createAstroPublicVerifier({ siteUrl: "https://site.example/base/", maximumResponseBytes: 1024, fetchImplementation: async () => new Response("x".repeat(1025), { status: 200, headers: { "content-type": "text/html" } }) });
  await assert.rejects(() => oversized({ work, destinationBinding }), /exceeds its configured bound/);
});
