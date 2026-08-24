export function parseServiceBaseUrl(value: string, label = "Discourse URL"): URL {
  if (
    typeof value !== "string"
    || value.includes("\\")
    || /(?:^|\/)\.{1,2}(?:\/|[?#]|$)/.test(value)
    || /%(?:25)*(?:2e|2f|5c)/i.test(value)
  ) {
    throw new Error(`${label} contains an ambiguous or escaping path segment.`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL.`);
  }

  if (!(["http:", "https:"] as string[]).includes(url.protocol)) {
    throw new Error(`${label} must use http or https.`);
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not contain credentials.`);
  }
  if (url.search || url.hash) {
    throw new Error(`${label} must not contain a query or fragment.`);
  }

  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}

export function normalizeServiceBaseUrl(value: string, label = "Discourse URL"): string {
  return parseServiceBaseUrl(value, label).href.replace(/\/$/, "");
}

const MAX_PUBLIC_URL_BYTES = 2_048;

export function normalizePublicHttpUrl(
  value: string,
  label = "Public URL",
  options: { allowQuery?: boolean; allowFragment?: boolean } = {},
): string {
  if (
    typeof value !== "string"
    || !value
    || value !== value.trim()
    || new TextEncoder().encode(value).byteLength > MAX_PUBLIC_URL_BYTES
    || /[\u0000-\u001f\u007f]/.test(value)
    || value.includes("\\")
    || value.startsWith("//")
  ) {
    throw new Error(`${label} must be a bounded absolute HTTP(S) URL.`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a bounded absolute HTTP(S) URL.`);
  }
  if (!(["http:", "https:"] as string[]).includes(url.protocol)) {
    throw new Error(`${label} must use http or https.`);
  }
  if (url.username || url.password) throw new Error(`${label} must not contain credentials.`);
  if (!options.allowQuery && url.search) throw new Error(`${label} must not contain a query.`);
  if (!options.allowFragment && url.hash) throw new Error(`${label} must not contain a fragment.`);
  return url.href;
}

export interface PublicDiscourseTopicUrl {
  href: string;
  serviceBase: string;
  topicId: number;
  slug?: string;
  postNumber?: number;
}

export function parsePublicDiscourseTopicUrl(
  value: string,
  serviceBaseValue?: string,
  label = "Discourse topic URL",
): PublicDiscourseTopicUrl {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  if (!/^https?:\/\/[^/?#]+(?:[/?#]|$)/i.test(value)) {
    throw new Error(`${label} must use canonical HTTP(S) authority syntax.`);
  }
  const schemeIndex = value.indexOf("://");
  const pathStart = schemeIndex >= 0 ? value.indexOf("/", schemeIndex + 3) : -1;
  const rawPath = pathStart >= 0 ? value.slice(pathStart).split(/[?#]/, 1)[0] : "";
  if (
    /\/{2,}/.test(rawPath)
    || /(?:^|\/)\.{1,2}(?:\/|$)/.test(rawPath)
    || /%(?:25)*(?:2e|2f|5c)/i.test(rawPath)
  ) {
    throw new Error(`${label} contains an ambiguous or escaping path segment.`);
  }
  const href = normalizePublicHttpUrl(value, label);
  const url = new URL(href);
  if (
    /(?:^|\/)\.{1,2}(?:\/|$)/.test(url.pathname)
    || /%(?:25)*(?:2e|2f|5c)/i.test(url.pathname)
  ) {
    throw new Error(`${label} contains an ambiguous or escaping path segment.`);
  }

  let serviceBase: URL;
  if (serviceBaseValue !== undefined) {
    serviceBase = parseServiceBaseUrl(serviceBaseValue, "Discourse URL");
  } else {
    const match = url.pathname.match(/^(.*)\/t\/(?:[^/]+\/)?[1-9]\d*(?:\/[1-9]\d*)?\/?$/);
    if (!match) throw new Error(`${label} must use a supported Discourse /t/ route.`);
    serviceBase = parseServiceBaseUrl(`${url.origin}${match[1]}`, "Derived Discourse URL");
  }

  const topic = parseDiscourseTopicReference(url.href, serviceBase);
  return {
    href: url.href,
    serviceBase: serviceBase.href.replace(/\/$/, ""),
    ...topic,
  };
}

export function resolveServiceRequestUrl(pathname: string, serviceBase: URL): URL {
  if (typeof pathname !== "string" || !pathname.trim()) {
    throw new Error("Discourse request target must be a non-empty relative path.");
  }
  if (
    pathname.startsWith("//")
    || pathname.includes("\\")
    || /^[A-Za-z][A-Za-z\d+.-]*:/.test(pathname)
  ) {
    throw new Error("Discourse request target must not be absolute or protocol-relative.");
  }

  if (pathname.includes("#")) {
    throw new Error("Discourse request target must not contain a fragment.");
  }
  const rawPath = pathname.split("?", 1)[0];
  if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(rawPath) || /%(?:25)*(?:2e|2f|5c)/i.test(rawPath)) {
    throw new Error("Discourse request target contains an ambiguous or escaping path segment.");
  }

  const relative = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  const url = new URL(relative, serviceBase);
  assertServiceResponseUrl(url, serviceBase, "Discourse request target");
  return url;
}

export function assertServiceResponseUrl(
  value: URL | string,
  serviceBase: URL,
  label = "Discourse response URL",
): void {
  const url = value instanceof URL ? value : new URL(value);
  if (url.origin !== serviceBase.origin || !url.pathname.startsWith(serviceBase.pathname)) {
    throw new Error(`${label} left the configured Discourse origin or path boundary.`);
  }
}

export function serviceRelativeRequestTarget(value: string, serviceBase: URL): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\\") || value.includes("#")) {
    throw new Error("Discourse reference must be a non-empty URL without backslashes or fragments.");
  }
  if (value.startsWith("//")) {
    throw new Error("Discourse reference must not be protocol-relative.");
  }
  const rawPath = value.split(/[?#]/, 1)[0];
  if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(rawPath) || /%(?:25)*(?:2e|2f|5c)/i.test(rawPath)) {
    throw new Error("Discourse reference contains an ambiguous or escaping path segment.");
  }
  const url = new URL(value, serviceBase);
  if (url.username || url.password) {
    throw new Error("Discourse reference must not contain credentials.");
  }
  assertServiceResponseUrl(url, serviceBase, "Discourse reference");
  const relative = `${url.pathname.slice(serviceBase.pathname.length)}${url.search}`;
  resolveServiceRequestUrl(relative, serviceBase);
  return relative;
}

export function parseDiscourseTopicReference(
  value: string,
  serviceBase: URL,
): { topicId: number; slug?: string; postNumber?: number } {
  const relative = serviceRelativeRequestTarget(value, serviceBase);
  const rawParts = relative.split("?", 1)[0].split("/");
  if (rawParts.some((part, index) => !part && index > 0 && index < rawParts.length - 1)) {
    throw new Error("Discourse topic reference must not contain duplicate path separators.");
  }
  const parts = rawParts.filter(Boolean);
  if (parts[0] !== "t") throw new Error("Discourse topic reference must use the /t/ route.");

  const route = parts.slice(1);
  let topicId: number | undefined;
  let postNumber: number | undefined;
  let slug: string | undefined;
  if (route.length === 1 && positiveIntegerSegment(route[0])) {
    topicId = Number(route[0]);
  } else if (route.length === 2 && route.every(positiveIntegerSegment)) {
    topicId = Number(route[0]);
    postNumber = Number(route[1]);
  } else if (
    (route.length === 2 || route.length === 3)
    && !/^\d+$/.test(route[0])
    && positiveIntegerSegment(route[1])
    && (route.length === 2 || positiveIntegerSegment(route[2]))
  ) {
    slug = route[0];
    topicId = Number(route[1]);
    if (route[2]) postNumber = Number(route[2]);
  }
  if (!topicId) throw new Error("Discourse topic reference has an unsupported route shape.");
  return {
    topicId,
    ...(slug ? { slug } : {}),
    ...(postNumber ? { postNumber } : {}),
  };
}

function positiveIntegerSegment(value: string | undefined): boolean {
  if (!value || !/^[1-9]\d*$/.test(value)) return false;
  return Number.isSafeInteger(Number(value));
}
