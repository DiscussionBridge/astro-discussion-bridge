import { pathToFileURL } from "node:url";

/**
 * No-install fixtures resolve actual source/extracted archive exports themselves.
 * Their alias otherwise erases documented server entries BEFORE Vite sees
 * the declared SSR boundary. Keep only those real modules as Node imports;
 * components and browser exports still compile normally. Ordinary customers
 * use normal bare imports and do not install this fixture helper.
 */
export function nativePackageAlias(specifier, resolvedFile) {
  return ["astro-discussion-bridge", "astro-discussion-bridge/server-url", "astro-discussion-bridge/controlled-creation", "astro-discussion-bridge/operational-state"].includes(specifier)
    ? { id: pathToFileURL(resolvedFile).href, external: true }
    : resolvedFile;
}
