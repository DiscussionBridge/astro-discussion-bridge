import { access, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  buildObbbaLawIncorporationWindowPlan,
  validateObbbaLawIncorporationWindowPlan,
} from "./obbba-law-incorporation-window-plan-lib.mjs";

export async function runObbbaLawIncorporationWindowPlan({
  authorityMapPath,
  outputPath,
}) {
  await requireAbsent(outputPath);
  const authorityMapText = await readFile(authorityMapPath, "utf8");
  const plan = buildObbbaLawIncorporationWindowPlan({ authorityMapText });
  validateObbbaLawIncorporationWindowPlan(plan, { authorityMapText });
  await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return plan;
}

async function requireAbsent(path) {
  try {
    await access(path);
    throw new Error(`Incorporation-window plan already exists: ${path}`);
  } catch (error) {
    if (error instanceof Error
      && error.message.startsWith("Incorporation-window plan already exists:")) {
      throw error;
    }
    if (error?.code !== "ENOENT") throw error;
  }
}

async function main() {
  const outputPath =
    "docs/evidence/OBBBA_LAW_INCORPORATION_WINDOW_INPUT_PLAN_2026-07-26.json";
  const plan = await runObbbaLawIncorporationWindowPlan({
    authorityMapPath:
      "docs/evidence/OBBBA_LAW_OFFICIAL_AUTHORITY_MAP_2026-07-26.json",
    outputPath,
  });
  process.stdout.write(
    `OBBBA incorporation window: ${plan.summary.titles} titles; `
    + `${plan.summary.uniqueUscTargets} USC targets; `
    + `${plan.summary.sourceArchives} official archives.\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
