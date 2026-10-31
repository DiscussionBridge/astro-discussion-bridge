import { pathToFileURL } from "node:url";

/**
 * No-install fixtures resolve actual source/extracted archive exports themselves.
 * Their alias otherwise erases the named server entry BEFORE Vite sees its
 * declared SSR external boundary. Keep that one real module a Node import;
 * components, browser modules and every other export still compile normally.
 */
export function nativePackageAlias(specifier, resolvedFile) {
  return specifier === "astro-discussion-bridge/server-url"
    ? { id: pathToFileURL(resolvedFile).href, external: true }
    : resolvedFile;
}
