import { assertServiceResponseUrl, parseServiceBaseUrl } from "./web-url.js";
import { closeResponse, readBoundedResponseBytes } from "./response-body.js";
export const PUBLIC_BOOTSTRAP_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export interface PublicForumSettings {
  title: unknown;
  poweredBy?: boolean;
}

/** Shared Label rule: validate the supplied bytes; trimming does not rename it. */
export function validateForumName(value: unknown, label = "DiscussionBridge forum name"): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(label + " requires configuration attention.");
  }
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength > 200 || /\p{Cc}/u.test(value)
      || new TextDecoder("utf-8", { fatal: true }).decode(bytes) !== value) {
    throw new Error(label + " requires configuration attention.");
  }
  return value;
}

/** The optional plugin-free setting overrides only its native-title fallback. */
export function resolveForumName(override: unknown, nativeTitle: unknown): string {
  return override === undefined
    ? validateForumName(nativeTitle, "Native source forum title")
    : validateForumName(override, "DISCUSSIONBRIDGE_FORUM_NAME");
}

/** The current connected effective label is authoritative. */
export async function resolveConnectedForumName(value: unknown): Promise<string> {
  return validateForumName(value, "DiscussionBridge source forum name");
}

/** Reuse the existing public core bootstrap; no connection credential is sent. */
export async function readPublicForumSettings(discourseUrl: string, fetchImplementation: typeof fetch = fetch): Promise<PublicForumSettings> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response | undefined;
  try {
    const base = parseServiceBaseUrl(discourseUrl, "Native source forum URL");
    const endpoint = new URL(base.href);
    endpoint.pathname = endpoint.pathname.replace(/\/+$/u, "") + "/";
    response = await fetchImplementation(endpoint.href, {
      credentials: "omit",
      headers: {
        Accept: "text/html",
        ...(typeof window === "undefined" ? {
          "User-Agent": PUBLIC_BOOTSTRAP_USER_AGENT,
          "Accept-Encoding": "identity",
        } : {}),
      },
      redirect: "error",
      signal: controller.signal,
    });
    if (response.url) assertServiceResponseUrl(response.url, base, "Native source forum bootstrap");
    if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0].toLowerCase() !== "text/html") {
      throw new Error("Invalid native forum bootstrap.");
    }
    const html = new TextDecoder().decode(await readBoundedResponseBytes(response, 512 * 1024, controller.signal));
    return parsePublicForumSettings(html);
  } catch {
    throw new Error("Native source forum title requires configuration attention.");
  } finally { closeResponse(response, controller); clearTimeout(timeout); }
}

/** Shared pure bootstrap decoder; browser callers acquire no server transport. */
export function parsePublicForumSettings(html: string): PublicForumSettings {
  if (new TextEncoder().encode(html).byteLength > 512 * 1024) throw new Error("Native forum bootstrap is too large.");
  const match = /<script[^>]+id=["']data-preloaded["'][^>]*>([\s\S]*?)<\/script>/iu.exec(html);
  if (!match) throw new Error("Native forum settings are unavailable.");
  const outer: unknown = JSON.parse(match[1]);
  const encoded = outer && typeof outer === "object" && !Array.isArray(outer)
    ? (outer as Record<string, unknown>).siteSettings : undefined;
  if (typeof encoded !== "string") throw new Error("Native forum settings are invalid.");
  const settings: unknown = JSON.parse(encoded);
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Native forum settings are invalid.");
  const values = settings as Record<string, unknown>;
  return { title: values.title, poweredBy: typeof values.enable_powered_by_discourse === "boolean" ? values.enable_powered_by_discourse : undefined };
}
