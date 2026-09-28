import path from "node:path";
import { readFile } from "node:fs/promises";
import { publishControlledDiscussions } from "../dist/controlled-creation.js";

const root = process.argv[2];
if (!root) throw new Error("Fixture root is required.");

globalThis.fetch = async (url, init) => {
  const correlationId = init.headers["X-DiscussionBridge-Correlation"];
  if (String(url).endsWith("/discussion-bridge/v1/connection.json")) {
    return new Response(JSON.stringify({
      contract_version: "0.2.0-alpha.21",
      connection_id: "dbc_aaaaaaaaaaaaaaaaaaaaaaaa",
      enabled: true,
      directions: ["to_discourse"],
      lanes: ["docs"],
      allowed_presentation_modes: ["simple", "full", "interactive"],
      supported_operations: ["resolve"],
      bounds: { resolve_json_bytes: 65_536, source_content_bytes: 16_777_216, claim_maximum_items: 32, lease_maximum_seconds: 14_400, catalog_segment_items: 100 },
      destination_policies: [{
        destination_policy_id: "destination:discourse:docs:1",
        profile: "discourse_as_publisher",
        presentation_mode: "interactive",
        container_mapping: { source: "site:docs", destination: "discourse:category:docs" },
        taxonomy_mapping: { mode: "mapped_only" },
        author_mapping: { mode: "source_attribution" },
        native_limit_policy: { maximum_bytes: 49_152, overflow_behavior: "excerpt_with_read_more" },
        catalog_revision: "catalog:test:1",
      }],
      catalog_required: false,
      policy_revision: "policy:test:1",
      correlation_id: correlationId,
    }), { status: 200, headers: { "content-type": "application/json", "X-DiscussionBridge-Correlation": correlationId } });
  }
  const request = JSON.parse(init.body).bridge_record;
  return new Response(JSON.stringify({
    outcome: "created",
    reason: "bridge_record_created",
    resource_id: "11111111-1111-4111-8111-111111111111",
    topic_id: 55,
    topic_url: "https://forum.example/community/t/example/55",
    direction: "to_discourse",
    accepted_source_revision: request.source_revision,
    accepted_source_revision_sequence: request.source_revision_sequence,
    core_fallback: false,
    correlation_id: correlationId,
  }), { status: 201, headers: { "content-type": "application/json", "X-DiscussionBridge-Correlation": correlationId } });
};

await publishControlledDiscussions({
  docsDir: root,
  stateFile: path.join(root, ".discussionbridge-state.json"),
  siteUrl: "https://site.example/",
  discourseUrl: "https://forum.example/community/",
  controlledCreation: {
    connectionId: "dbc_aaaaaaaaaaaaaaaaaaaaaaaa",
    connectionSecret: "s".repeat(32),
    lane: "docs",
  },
}, {
  lockOptions: { staleMs: 2_000, updateMs: 1_000 },
  afterResultStaged: async () => {
    const state = JSON.parse(await readFile(path.join(root, ".discussionbridge-state.json"), "utf8"));
    const operation = Object.values(state.operations)[0];
    process.stdout.write(`${JSON.stringify({
      correlationId: operation.correlationId,
      externalId: operation.externalId,
    })}\n`);
    await new Promise(() => {});
  },
});
