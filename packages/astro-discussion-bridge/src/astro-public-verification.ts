import type { AstroPublicationDestination } from "./publication-worker.js";

const DEFAULT_MAXIMUM_RESPONSE_BYTES = 20 * 1024 * 1024;
const MAXIMUM_RESPONSE_BYTES = 32 * 1024 * 1024;

export interface AstroPublicVerificationOptions {
  siteUrl: string;
  fetchImplementation?: typeof fetch;
  requestTimeoutMs?: number;
  maximumResponseBytes?: number;
  now?: () => Date;
}

export function createAstroPublicVerifier(options: AstroPublicVerificationOptions): AstroPublicationDestination["verify"] {
  const site = exactSite(options.siteUrl);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const timeout = integer(options.requestTimeoutMs ?? 15_000, 1_000, 60_000, "verification timeout");
  const maximum = integer(options.maximumResponseBytes ?? DEFAULT_MAXIMUM_RESPONSE_BYTES, 1_024, MAXIMUM_RESPONSE_BYTES, "verification response bound");
  const now = options.now ?? (() => new Date());
  return async ({ work, destinationBinding }) => {
    const target = new URL(destinationBinding.canonicalUrl);
    if (target.protocol !== "https:" || target.origin !== site.origin || !target.pathname.startsWith(site.pathname) || target.username || target.password || target.search || target.hash) {
      throw new Error("Astro public verification URL is outside the configured site.");
    }
    const response = await fetchImplementation(target, {
      method: "GET",
      redirect: "error",
      credentials: "omit",
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(timeout),
    });
    if (response.url && response.url !== target.href) throw new Error("Astro public verification URL changed.");
    if (!response.ok || !(response.headers.get("content-type") ?? "").toLowerCase().startsWith("text/html")) throw new Error("Astro publication is not publicly available as HTML.");
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maximum) throw new Error("Astro public verification response exceeds its configured bound.");
    const html = await boundedBody(response, maximum);
    if (!html.includes(`data-discussionbridge-resource-id="${work.resourceId}"`)) throw new Error("Astro public publication resource identity is stale.");
    if (!html.includes(`data-discussionbridge-source-revision="${escapeAttribute(work.sourceRevision)}"`)) throw new Error("Astro public publication source revision is stale.");
    return { publiclyVerifiedAt: now().toISOString() };
  };
}

async function boundedBody(response: Response, maximum: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) { await reader.cancel(); throw new Error("Astro public verification response exceeds its configured bound."); }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(combined);
}

function exactSite(value: string): URL {
  const site = new URL(value);
  if (site.protocol !== "https:" || site.username || site.password || site.search || site.hash || !site.pathname.endsWith("/")) throw new Error("Astro site URL must be an exact HTTPS directory URL.");
  return site;
}

function integer(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`Astro ${label} is invalid.`);
  return value;
}

function escapeAttribute(value: string): string { return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
