import { pathToFileURL } from "node:url";

import {
  extractObbbaLawIncorporationWindowXml,
} from "./obbba-law-usc-xml-extractor.mjs";

async function main() {
  const evidence = await extractObbbaLawIncorporationWindowXml({
    archiveEvidencePath:
      "docs/evidence/OBBBA_LAW_INCORPORATION_WINDOW_ARCHIVE_EVIDENCE_2026-07-26.json",
    archiveDirectory:
      ".discussionbridge-cache/obbba-law-usc-incorporation-archives-2026-07-26",
    xmlDirectory:
      ".discussionbridge-cache/obbba-law-usc-incorporation-xml-2026-07-26",
    xmlEvidencePath:
      "docs/evidence/OBBBA_LAW_INCORPORATION_WINDOW_XML_EVIDENCE_2026-07-26.json",
    onProgress: ({ completed, total, entry }) => {
      if (entry) {
        process.stdout.write(
          `Extracting ${completed + 1}/${total}: `
          + `${entry.releaseRole} USC ${entry.uscTitle}.\n`,
        );
      }
    },
  });
  process.stdout.write(
    `Extracted ${evidence.summary.documents} incorporation-window XML documents `
    + `(${evidence.summary.totalBytes} bytes).\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
