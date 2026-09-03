import path from "node:path";
import { readFile } from "node:fs/promises";
import { publishControlledDiscussions } from "../dist/controlled-creation.js";

const root = process.argv[2];
if (!root) throw new Error("Fixture root is required.");

globalThis.fetch = async (_url, init) => {
  const request = JSON.parse(init.body).bridge_record;
  return new Response(JSON.stringify({
    outcome: "created",
    reason: "bridge_record_created",
    resource_id: "11111111-1111-4111-8111-111111111111",
    topic_id: 55,
    topic_url: "https://forum.example/community/t/example/55",
    direction: "to_discourse",
    core_fallback: false,
  }), { status: 201, headers: { "content-type": "application/json" } });
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
