import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { publishControlledDiscussions } from "../dist/index.js";

const pageCount = positiveInteger(process.env.DISCUSSIONBRIDGE_ASTRO_BENCHMARK_PAGES, 1_000);
const rounds = positiveInteger(process.env.DISCUSSIONBRIDGE_ASTRO_BENCHMARK_ROUNDS, 3);
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "discussionbridge-astro-large-site-"));
const pagesDir = path.join(fixtureRoot, "src", "pages");
const baselineDurations = [];
const bridgeDurations = [];
const adapterScanDurations = [];
const execFileAsync = promisify(execFile);
const buildRunner = fileURLToPath(new URL("./run-large-site-build.mjs", import.meta.url));

try {
  await mkdir(pagesDir, { recursive: true });
  await Promise.all(Array.from({ length: pageCount }, (_, index) => {
    const number = String(index + 1).padStart(4, "0");
    return writeFile(path.join(pagesDir, `page-${number}.md`), `---\ntitle: Page ${number}\ndiscussionCommentsDisplay: full\ndiscussionSync: false\n---\n\n# Page ${number}\n\nRepresentative static content for the DiscussionBridge Astro large-site verifier.\n`, "utf8");
  }));

  for (let round = 0; round < rounds; round++) {
    const order = round % 2 === 0 ? ["baseline", "bridge"] : ["bridge", "baseline"];
    for (const variant of order) {
      const outDir = path.join(fixtureRoot, `dist-${variant}`);
      await rm(outDir, { recursive: true, force: true });
      const started = performance.now();
      await execFileAsync(process.execPath, [buildRunner, fixtureRoot, outDir, variant], {
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });
      const elapsed = Math.round(performance.now() - started);
      (variant === "bridge" ? bridgeDurations : baselineDurations).push(elapsed);
    }
  }

  const generatedHtml = await countHtml(path.join(fixtureRoot, "dist-bridge"));
  if (generatedHtml !== pageCount) {
    throw new Error(`Expected ${pageCount} generated HTML files, received ${generatedHtml}.`);
  }

  for (let round = 0; round < Math.max(rounds, 5); round++) {
    const started = performance.now();
    const results = await publishControlledDiscussions({
      docsDir: pagesDir,
      stateFile: path.join(fixtureRoot, ".discussionbridge", "benchmark-state.json"),
      siteUrl: "https://site.example/",
      discourseUrl: "https://forum.example/",
      controlledCreation: {
        connectionId: "dbc_000000000000000000000000",
        connectionSecret: "benchmark-only-secret-that-never-leaves-the-process",
      },
    });
    if (results.length !== pageCount || results.some((result) => result.status !== "skipped")) {
      throw new Error("Large-site adapter scan did not return the complete no-op census.");
    }
    adapterScanDurations.push(Math.round(performance.now() - started));
  }

  const baselineMedianMs = median(baselineDurations);
  const bridgeMedianMs = median(bridgeDurations);
  const result = {
    corpus: { markdownPages: pageCount, generatedHtml },
    rounds,
    baselineBuildMs: baselineDurations,
    discussionBridgeBuildMs: bridgeDurations,
    median: {
      baselineMs: baselineMedianMs,
      discussionBridgeMs: bridgeMedianMs,
      adapterOverheadMs: bridgeMedianMs - baselineMedianMs,
      adapterOverheadPercent: Number((((bridgeMedianMs - baselineMedianMs) / baselineMedianMs) * 100).toFixed(1)),
      adapterScanMs: median(adapterScanDurations),
    },
    adapterScanMs: adapterScanDurations,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

function positiveInteger(value, fallback) {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 10_000) {
    throw new Error("Large-site verifier page and round counts must be integers between 1 and 10,000.");
  }
  return resolved;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

async function countHtml(root) {
  let count = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory()) count += await countHtml(path.join(root, entry.name));
    else if (entry.isFile() && entry.name.endsWith(".html")) count++;
  }
  return count;
}
