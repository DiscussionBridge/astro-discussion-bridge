import {
  fetchAlpha21ConnectionCapability,
  requestAlpha21Json,
  type Alpha21ConnectionCapability,
  type Alpha21Credentials,
} from "./alpha21-client.js";

const SEGMENT_TYPES = ["containers", "taxonomies", "terms", "authors", "presentation_modes", "native_limits"] as const;
type CatalogSegmentType = typeof SEGMENT_TYPES[number];

export interface AstroCatalogSegment {
  segmentType: CatalogSegmentType;
  items: Record<string, unknown>[];
}

export interface AstroCatalogPage {
  catalogRevision: string;
  segmentType: CatalogSegmentType;
  items: Record<string, unknown>[];
  nextCursor: string | null;
  complete: boolean;
}

export async function fetchAstroCatalogPage(
  credentials: Alpha21Credentials,
  input: { segmentType: CatalogSegmentType; catalogRevision?: string; cursor?: string; limit?: number },
  capability?: Alpha21ConnectionCapability,
): Promise<AstroCatalogPage> {
  await requireCatalogCapability(credentials, capability);
  const query = new URLSearchParams({ platform_profile: "astro", segment_type: input.segmentType });
  if (input.catalogRevision !== undefined) query.set("catalog_revision", boundedText(input.catalogRevision, 255, "catalog revision"));
  if (input.cursor !== undefined) query.set("cursor", boundedText(input.cursor, 8_192, "catalog cursor"));
  if (input.limit !== undefined) query.set("limit", String(boundedInteger(input.limit, 1, 100, "catalog limit")));
  const response = await requestAlpha21Json({
    method: "GET",
    path: `/discussion-bridge/v1/platform-catalog.json?${query.toString()}`,
    credentials,
  });
  const value = response.payload;
  exactFields(value, ["catalog_revision", "platform_profile", "segment_type", "items", "next_cursor", "complete", "correlation_id"], "catalog response");
  if (value.platform_profile !== "astro" || value.segment_type !== input.segmentType) throw new Error("DiscussionBridge catalog response identity is inconsistent.");
  const revision = boundedText(value.catalog_revision, 255, "catalog revision");
  if (input.catalogRevision !== undefined && revision !== input.catalogRevision) throw new Error("DiscussionBridge catalog revision changed during resume.");
  return {
    catalogRevision: revision,
    segmentType: input.segmentType,
    items: validateCatalogItems(input.segmentType, value.items),
    nextCursor: value.next_cursor === null ? null : boundedText(value.next_cursor, 8_192, "catalog cursor"),
    complete: requiredBoolean(value.complete, "catalog completion"),
  };
}

export async function publishAstroCatalog(
  credentials: Alpha21Credentials,
  input: { baseCatalogRevision: string; segments: AstroCatalogSegment[] },
  capability?: Alpha21ConnectionCapability,
): Promise<{ catalogRevision: string; acceptedSegments: CatalogSegmentType[] }> {
  await requireCatalogCapability(credentials, capability);
  const baseCatalogRevision = boundedText(input.baseCatalogRevision, 255, "base catalog revision");
  if (!Array.isArray(input.segments) || input.segments.length < 1 || input.segments.length > SEGMENT_TYPES.length) {
    throw new Error("DiscussionBridge catalog segments are invalid.");
  }
  const seen = new Set<CatalogSegmentType>();
  const segments = input.segments.map((segment) => {
    if (!SEGMENT_TYPES.includes(segment.segmentType) || seen.has(segment.segmentType)) throw new Error("DiscussionBridge catalog segment type is invalid or duplicated.");
    seen.add(segment.segmentType);
    return { segment_type: segment.segmentType, items: validateCatalogItems(segment.segmentType, segment.items) };
  });
  const response = await requestAlpha21Json({
    method: "PUT",
    path: "/discussion-bridge/v1/platform-catalog.json",
    credentials,
    body: { platform_profile: "astro", base_catalog_revision: baseCatalogRevision, segments },
  });
  const value = response.payload;
  exactFields(value, ["catalog_revision", "platform_profile", "accepted_segments", "correlation_id"], "catalog update response");
  if (value.platform_profile !== "astro") throw new Error("DiscussionBridge catalog update returned the wrong platform profile.");
  const accepted = requiredArray(value.accepted_segments, "accepted catalog segments").map((item) => boundedText(item, 64, "accepted catalog segment"));
  if (accepted.length !== segments.length || accepted.some((item, index) => item !== segments[index].segment_type)) {
    throw new Error("DiscussionBridge catalog update did not accept the exact supplied segments.");
  }
  return {
    catalogRevision: boundedText(value.catalog_revision, 255, "catalog revision"),
    acceptedSegments: accepted as CatalogSegmentType[],
  };
}

async function requireCatalogCapability(credentials: Alpha21Credentials, supplied?: Alpha21ConnectionCapability): Promise<void> {
  const capability = supplied ?? await fetchAlpha21ConnectionCapability(credentials);
  if (!capability.enabled || !capability.directions.includes("from_discourse") || !capability.supportedOperations.includes("catalog")) {
    throw new Error("DiscussionBridge connection does not allow catalog operations.");
  }
  if (!capability.destinationPolicies.some((policy) => policy.profile === "astro")) throw new Error("DiscussionBridge connection has no Astro destination policy.");
}

function validateCatalogItems(segmentType: CatalogSegmentType, value: unknown): Record<string, unknown>[] {
  const items = requiredArray(value, "catalog items");
  if (items.length > 100) throw new Error("DiscussionBridge catalog segment exceeds 100 items.");
  const identifiers = new Set<string>();
  return items.map((candidate) => {
    const item = requiredObject(candidate, "catalog item");
    const schemas: Record<CatalogSegmentType, string[]> = {
      containers: ["id", "name", "kind", "available"],
      taxonomies: ["id", "name", "hierarchical", "available"],
      terms: ["id", "taxonomy_id", "name", "parent_id", "available"],
      authors: ["id", "name", "available"],
      presentation_modes: ["id", "name", "available"],
      native_limits: ["id", "name", "maximum_bytes", "overflow_behavior", "available"],
    };
    exactFields(item, schemas[segmentType], "catalog item");
    const id = boundedText(item.id, 255, "catalog item ID");
    if (identifiers.has(id)) throw new Error("DiscussionBridge catalog item ID is duplicated.");
    identifiers.add(id);
    boundedText(item.name, 255, "catalog item name");
    requiredBoolean(item.available, "catalog item availability");
    if (segmentType === "containers") boundedText(item.kind, 255, "catalog container kind");
    if (segmentType === "taxonomies") requiredBoolean(item.hierarchical, "catalog taxonomy hierarchy");
    if (segmentType === "terms") {
      boundedText(item.taxonomy_id, 255, "catalog taxonomy ID");
      if (item.parent_id !== null) boundedText(item.parent_id, 255, "catalog parent ID");
    }
    if (segmentType === "presentation_modes") {
      if (!["simple", "full", "interactive"].includes(id)) throw new Error("DiscussionBridge catalog presentation mode is invalid.");
    }
    if (segmentType === "native_limits") {
      boundedInteger(item.maximum_bytes, 1, Number.MAX_SAFE_INTEGER, "catalog native limit");
      if (!["complete", "excerpt_with_read_more", "operator_attention"].includes(String(item.overflow_behavior))) throw new Error("DiscussionBridge catalog overflow behavior is invalid.");
    }
    return structuredClone(item);
  });
}

function exactFields(value: Record<string, unknown>, required: readonly string[], label: string): void {
  for (const field of required) if (!Object.hasOwn(value, field)) throw new Error(`DiscussionBridge ${label}.${field} is required.`);
  const allowed = new Set(required);
  for (const field of Object.keys(value)) if (!allowed.has(field)) throw new Error(`DiscussionBridge ${label}.${field} is unknown.`);
}

function requiredObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return value as Record<string, unknown>;
}

function requiredArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`DiscussionBridge ${label} are invalid.`);
  return value;
}

function boundedText(value: unknown, maximum: number, label: string): string {
  if (typeof value !== "string" || !value || value !== value.trim() || new TextEncoder().encode(value).byteLength > maximum || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return value;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return Number(value);
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`DiscussionBridge ${label} is invalid.`);
  return value;
}
