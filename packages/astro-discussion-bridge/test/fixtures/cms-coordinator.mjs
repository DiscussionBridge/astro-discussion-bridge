import { createHash } from "node:crypto";

export const uuid = index => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
export const connectionId = "dbc_0123456789abcdef01234567";
export const connection = {
  connection_id: connectionId, profile: "astro", destination_origin: "https://astro.example", scope_revision: "scope-1", forum_name: "Native forum",
  directions: ["from_discourse"], publication_lane: "docs",
  policy: { policy_revision: "policy-1", enabled: true, selection: "all_public", category_ids: [], include_topic_ids: [], exclude_topic_ids: [], include_unlisted: false, publication_kind: "static", presentation_mode: "full", author_ids: [], taxonomy_ids: [] },
  native_capabilities: { native_revision: "profile-1", supported_presentations: ["simple", "full", "interactive"], publication_kind: "static", complete_content_supported: true },
};
export const html = "<p>Complete native source.</p>";
export const source = {
  source_id: "topic:53", source_revision: "revision-1", topic_id: "53", topic_url: "https://forum.example/t/source/53", title: "Native source",
  content_sha256: createHash("sha256").update(html).digest("hex"), content_bytes: Buffer.byteLength(html), source_created_at: "2026-10-01T08:00:00.000Z", source_updated_at: "2026-10-14T08:00:00.000Z", source_authors: [{ id: "author:1", name: "Source author" }],
};
export const event = { event_type: "publication", event_id: uuid(10), event_sequence: "10", source };
export const work = { work_id: uuid(1), mapping_id: uuid(2), source_id: source.source_id, source_revision: source.source_revision, policy_revision: "policy-1", action: "publish_revision", state: "leased", attempt_cycle: uuid(3), attempt: 1, lease_generation: 1, retry_at: null, last_failure_code: null };
export const lease = { work, lease_token: Buffer.alloc(32, 7).toString("base64url"), lease_generation: 1, expires_at: "2026-10-14T10:05:00.000Z", server_time: "2026-10-14T10:00:00.000Z" };
export function mapping(body) {
  return { mapping_id: uuid(2), resource_id: uuid(4), connection_id: connectionId, source_id: source.source_id, external_id: body.external_id, mapping_revision: "mapping-1", destination_native_id: null, canonical_url: body.canonical_url, retired_url_count: 0, mapping_state: "pending", presentation_mode: "full", desired_source_revision: source.source_revision, synchronized_source_revision: null, publicly_verified_source_revision: null, destination_native_revision: null, source_created_at: source.source_created_at, source_updated_at: source.source_updated_at, synchronized_at: null, publicly_verified_at: null };
}
