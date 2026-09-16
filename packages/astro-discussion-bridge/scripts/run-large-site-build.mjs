import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "astro";
import discussionBridge from "../dist/index.js";

const [fixtureRoot, outDir, variant] = process.argv.slice(2);
if (!fixtureRoot || !outDir || (variant !== "baseline" && variant !== "bridge")) {
  throw new Error("Usage: run-large-site-build.mjs <fixture-root> <output-directory> <baseline|bridge>");
}

await build({
  root: pathToFileURL(`${path.resolve(fixtureRoot)}${path.sep}`),
  outDir: path.resolve(outDir),
  logLevel: "error",
  integrations: variant === "bridge" ? [discussionBridge({
    discourseUrl: "https://forum.example/",
    siteUrl: "https://site.example/",
    publishOnBuild: {
      enabled: true,
      docsDir: "src/pages",
      connectionId: "dbc_000000000000000000000000",
      connectionSecret: "benchmark-only-secret-that-never-leaves-the-process",
    },
  })] : [],
});
