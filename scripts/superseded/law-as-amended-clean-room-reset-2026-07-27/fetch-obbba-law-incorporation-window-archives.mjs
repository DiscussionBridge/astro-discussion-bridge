import { pathToFileURL } from "node:url";

import { collectObbbaLawUscArchives } from "./obbba-law-usc-archive-collector.mjs";

async function main() {
  const evidence = await collectObbbaLawUscArchives({
    planPath:
      "docs/evidence/OBBBA_LAW_INCORPORATION_WINDOW_INPUT_PLAN_2026-07-26.json",
    archiveDirectory:
      ".discussionbridge-cache/obbba-law-usc-incorporation-archives-2026-07-26",
    evidencePath:
      "docs/evidence/OBBBA_LAW_INCORPORATION_WINDOW_ARCHIVE_EVIDENCE_2026-07-26.json",
    onProgress: ({ completed, total, source }) => {
      if (source) {
        process.stdout.write(
          `Fetching ${completed + 1}/${total}: `
          + `${source.releaseRole} USC ${source.uscTitle}.\n`,
        );
      }
    },
  });
  process.stdout.write(
    `Collected ${evidence.summary.archives} incorporation-window archives `
    + `(${evidence.summary.totalBytes} bytes).\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
