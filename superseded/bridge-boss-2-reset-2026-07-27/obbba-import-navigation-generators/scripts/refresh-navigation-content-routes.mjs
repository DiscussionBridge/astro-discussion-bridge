import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bindNavigationContentRoutes,
  buildNavigationContentBindings,
  loadNavigationDiscoveryConfig,
  parseNavigationManifest,
  writeNavigationManifest,
} from "../packages/astro-discussion-bridge/dist/navigation.js";

const [projectRootArg, siteUrl, configArg, manifestArg, outputArg] = process.argv.slice(2);
if (!projectRootArg || !siteUrl || !configArg || !manifestArg || !outputArg) {
  throw new Error(
    "Usage: node scripts/refresh-navigation-content-routes.mjs PROJECT_ROOT SITE_URL CONFIG MANIFEST OUTPUT",
  );
}

const projectRoot = path.resolve(projectRootArg);
const config = await loadNavigationDiscoveryConfig(path.resolve(configArg));
const current = parseNavigationManifest(
  JSON.parse(await fs.readFile(path.resolve(manifestArg), "utf8")),
);
const bindings = await buildNavigationContentBindings({
  projectRoot,
  siteUrl,
  sources: config.contentSources,
});
const refreshed = bindNavigationContentRoutes(current, bindings);
await writeNavigationManifest(path.resolve(outputArg), refreshed);

let bound = 0;
for (const lens of refreshed.lenses) walk(lens.nodes, (node) => {
  if (node.url) bound += 1;
});
process.stdout.write(
  `Created navigation candidate with ${bindings.length} content bindings and ${bound} bound nodes.\n`,
);

function walk(nodes, visit) {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}
