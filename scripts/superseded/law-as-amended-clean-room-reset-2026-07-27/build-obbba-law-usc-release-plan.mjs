import { access, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  buildObbbaLawUscReleasePlan,
  validateObbbaLawUscReleasePlan,
} from "./obbba-law-usc-release-plan-lib.mjs";

export async function runObbbaLawUscReleasePlan({ authorityMapPath, outputPath }) {
  await requireAbsent(outputPath);
  const authorityMapText = await readFile(authorityMapPath, "utf8");
  const plan = buildObbbaLawUscReleasePlan({ authorityMapText });
  validateObbbaLawUscReleasePlan(plan, { authorityMapText });
  await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return plan;
}

async function requireAbsent(filePath) {
  try {
    await access(filePath);
    throw new Error(`U.S. Code release plan already exists: ${filePath}`);
  } catch (error) {
    if (error instanceof Error
      && error.message.startsWith("U.S. Code release plan already exists:")) {
      throw error;
    }
    if (error?.code !== "ENOENT") throw error;
  }
}

async function main() {
  const outputPath =
    "docs/evidence/OBBBA_LAW_USC_RELEASE_INPUT_PLAN_V3_2026-07-26.json";
  const plan = await runObbbaLawUscReleasePlan({
    authorityMapPath:
      "docs/evidence/OBBBA_LAW_OFFICIAL_AUTHORITY_MAP_2026-07-26.json",
    outputPath,
  });
  process.stdout.write(
    `OBBBA Law USC release plan: ${plan.summary.titles} titles; `
    + `${plan.summary.sourceArchives} official XML archives.\n`
    + `Written create-only: ${outputPath}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
