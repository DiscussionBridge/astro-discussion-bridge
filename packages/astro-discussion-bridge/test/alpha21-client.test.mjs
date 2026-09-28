import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  Alpha21RequestError,
  fetchAlpha21ConnectionCapability,
  requestAlpha21Json,
} from "../dist/alpha21-client.js";

const contract = JSON.parse(await readFile(
  new URL("../node_modules/discussionbridge-adapter-contract/contract.json", import.meta.url),
  "utf8",
));
const capabilityFixture = JSON.parse(await readFile(
  new URL("../node_modules/discussionbridge-adapter-contract/fixtures/connection-capability-to-discourse.json", import.meta.url),
  "utf8",
));
const connectionId = capabilityFixture.connection_id;
const connectionSecret = "s".repeat(40);

function jsonResponse(body, correlationId, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      "X-DiscussionBridge-Correlation": correlationId,
      ...init.headers,
    },
  });
}

test("protected requests carry exact Alpha.21 authentication and correlation", async () => {
  let captured;
  const response = await requestAlpha21Json({
    method: "POST",
    path: "/discussion-bridge/v1/example.json",
    credentials: {
      discourseUrl: "https://forum.example/community/",
      connectionId,
      connectionSecret,
      fetchImplementation: async (url, init) => {
        captured = { url: String(url), init };
        return jsonResponse({ accepted: true, correlation_id: "request-01" }, "request-01");
      },
    },
    correlationId: "request-01",
    body: { example: true },
  });
  assert.equal(captured.url, "https://forum.example/community/discussion-bridge/v1/example.json");
  assert.equal(captured.init.redirect, "error");
  assert.equal(captured.init.headers[contract.authentication.connection_header], connectionId);
  assert.equal(captured.init.headers[contract.authentication.secret_header], connectionSecret);
  assert.equal(captured.init.headers[contract.authentication.contract_header], contract.version);
  assert.equal(captured.init.headers[contract.common.correlation_header], "request-01");
  assert.deepEqual(JSON.parse(captured.init.body), { example: true, correlation_id: "request-01" });
  assert.equal(response.correlationId, "request-01");
});

test("connection capability is validated against released Alpha.21 constants", async () => {
  const capability = await fetchAlpha21ConnectionCapability({
    discourseUrl: "https://forum.example/",
    connectionId,
    connectionSecret,
    fetchImplementation: async (_url, init) => jsonResponse(
      { ...capabilityFixture, correlation_id: init.headers[contract.common.correlation_header] },
      init.headers[contract.common.correlation_header],
    ),
  }, "capability-test");
  assert.equal(capability.contractVersion, contract.version);
  assert.equal(capability.connectionId, connectionId);
  assert.deepEqual(capability.allowedPresentationModes, contract.configuration.presentation_modes);
  assert.equal(capability.bounds.resolveJsonBytes, contract.resolve.maximum_json_bytes);
  assert.equal(capability.bounds.sourceContentBytes, contract.common.source_content_maximum_bytes);
  assert.equal(capability.bounds.claimMaximumItems, contract.publication_work.claim.maximum_items);
  assert.equal(capability.bounds.leaseMaximumSeconds, contract.publication_work.claim.maximum_total_lease_seconds);
  assert.equal(capability.bounds.catalogSegmentItems, contract.platform_catalog.maximum_items_per_segment);
});

test("correlation, response bounds, redirects, and content type fail closed", async (t) => {
  const cases = [
    {
      name: "wrong response header correlation",
      fetchImplementation: async () => jsonResponse({ correlation_id: "request-03" }, "wrong"),
    },
    {
      name: "wrong response body correlation",
      fetchImplementation: async () => jsonResponse({ correlation_id: "wrong" }, "request-03"),
    },
    {
      name: "wrong content type",
      fetchImplementation: async () => new Response("{}", { headers: { "content-type": "text/html" } }),
    },
    {
      name: "declared response too large",
      fetchImplementation: async () => new Response("{}", { headers: {
        "content-type": "application/json",
        "content-length": "70000",
        "X-DiscussionBridge-Correlation": "request-03",
      } }),
    },
    {
      name: "response origin changed",
      fetchImplementation: async () => Object.defineProperty(
        jsonResponse({ correlation_id: "request-03" }, "request-03"),
        "url",
        { value: "https://attacker.invalid/response.json" },
      ),
    },
  ];
  for (const item of cases) {
    await t.test(item.name, async () => {
      await assert.rejects(requestAlpha21Json({
        method: "GET",
        path: "/discussion-bridge/v1/example.json",
        credentials: {
          discourseUrl: "https://forum.example/",
          connectionId,
          connectionSecret,
          fetchImplementation: item.fetchImplementation,
        },
        correlationId: "request-03",
      }));
    });
  }
});

test("bounded error envelopes remain typed and redact the connection secret", async () => {
  await assert.rejects(
    requestAlpha21Json({
      method: "GET",
      path: "/discussion-bridge/v1/example.json",
      credentials: {
        discourseUrl: "https://forum.example/",
        connectionId,
        connectionSecret,
        fetchImplementation: async () => jsonResponse({
          error_code: "validation_failed",
          message: `bad value ${connectionSecret}`,
          correlation_id: "request-04",
        }, "request-04", { status: 422 }),
      },
      correlationId: "request-04",
    }),
    (error) => {
      assert.ok(error instanceof Alpha21RequestError);
      assert.equal(error.errorCode, "validation_failed");
      assert.equal(error.status, 422);
      assert.equal(error.correlationId, "request-04");
      assert.doesNotMatch(error.message, new RegExp(connectionSecret));
      assert.match(error.message, /\[REDACTED\]/);
      return true;
    },
  );
});

test("capability fields cannot expand or contradict the authenticated policy", async (t) => {
  const cases = [
    ["wrong connection", { connection_id: "dbc_333333333333333333333333" }],
    ["wrong contract", { contract_version: "0.2.0-alpha.20" }],
    ["unknown presentation", { allowed_presentation_modes: ["simple", "full", "other"] }],
    ["wrong bound", { bounds: { ...capabilityFixture.bounds, claim_maximum_items: 100 } }],
    ["unknown field", { unexpected: true }],
  ];
  for (const [name, change] of cases) {
    await t.test(name, async () => {
      await assert.rejects(fetchAlpha21ConnectionCapability({
        discourseUrl: "https://forum.example/",
        connectionId,
        connectionSecret,
        fetchImplementation: async (_url, init) => jsonResponse(
          { ...capabilityFixture, ...change, correlation_id: init.headers[contract.common.correlation_header] },
          init.headers[contract.common.correlation_header],
        ),
      }, `capability-${String(name).replaceAll(" ", "-")}`));
    });
  }
});
