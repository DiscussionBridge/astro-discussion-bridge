import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Test-only resolution of already installed, version-checked dependencies.
// Relative source/runtime imports always resolve inside the current V4 package.
const installed = createRequire(new URL("../../../../../astro/packages/astro-discussion-bridge/package.json", import.meta.url));
const currentPackage = new URL("../", import.meta.url).href;
const dependencies = new Set(["proper-lockfile", "sanitize-html", "@astrojs/markdown-remark", "dompurify", "yaml", "astro", "sharp"]);

export function resolve(specifier, context, nextResolve) {
  if (dependencies.has(specifier) && context.parentURL?.startsWith(currentPackage)) {
    const url = pathToFileURL(installed.resolve(specifier)).href;
    if (!url.includes("/node_modules/")) throw new Error("Test dependency resolved outside installed node_modules.");
    return { url, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
