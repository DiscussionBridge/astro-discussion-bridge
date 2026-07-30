import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CURRENT_PRIOR_PLAN_SHA256 =
  "5a76438265c076c3be6188fed52ebf21078ea928177a8659e03be1fc209bb6c7";
const INCORPORATION_PLAN_SHA256 =
  "562759559ff62101394fe512c38e68593fbbc8ce2d10f3719f101d351d875c10";
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;

export async function collectObbbaLawUscArchives({
  planPath,
  archiveDirectory,
  evidencePath,
  fetcher = globalThis.fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  onProgress = () => undefined,
  deadlineMs = 30_000,
}) {
  const repositoryRoot = resolve(dirname(resolve(planPath)), "..", "..");
  const cacheRoot = join(repositoryRoot, ".discussionbridge-cache");
  validateCachePath(archiveDirectory, cacheRoot);
  await requireAbsent(archiveDirectory, "archive directory");
  await requireAbsent(evidencePath, "archive evidence");
  const planText = await readFile(planPath, "utf8");
  const profile = planProfile(planPath);
  if (sha256(planText) !== profile.sha256) {
    throw new Error("Approved USC release-plan byte commitment does not match.");
  }
  const sources = profile.validate(JSON.parse(planText));
  let cacheRootCreated = false;
  try {
    await mkdir(cacheRoot, { recursive: false });
    cacheRootCreated = true;
  } catch (error) {
    if (error?.code !== "EEXIST" || !(await stat(cacheRoot)).isDirectory()) {
      throw error;
    }
  }
  const stagingDirectory = join(
    dirname(archiveDirectory),
    `.discussionbridge-usc-archives-${randomUUID()}`,
  );
  await mkdir(stagingDirectory, { recursive: false });
  let archiveDirectoryOwned = false;
  try {
    const archives = [];
    let totalBytes = 0;
    for (const [index, source] of sources.entries()) {
      onProgress({ completed: index, total: sources.length, source });
      const bytes = await fetchArchive({
        source,
        fetcher,
        sleep,
        deadlineMs,
      });
      totalBytes += bytes.length;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error("USC archive collection exceeds the 1 GiB total limit.");
      }
      const zip = inspectZip(bytes, source.expectedArchiveEntry);
      const fileName = `${source.releaseRole}-usc${source.uscTitle.padStart(2, "0")}.zip`;
      await writeFile(join(stagingDirectory, fileName), bytes, { flag: "wx" });
      archives.push({
        releaseRole: source.releaseRole,
        releasePoint: source.releasePoint,
        uscTitle: source.uscTitle,
        sourceUrl: source.archiveUrl,
        fileName,
        bytes: bytes.length,
        sha256: sha256(bytes),
        expectedArchiveEntry: source.expectedArchiveEntry,
        xmlUncompressedBytes: zip.uncompressedBytes,
        xmlCrc32: zip.crc32,
      });
    }
    // Claim the destination with an exclusive mkdir so a late competing
    // directory can never be replaced by rename semantics.
    await mkdir(archiveDirectory, { recursive: false });
    archiveDirectoryOwned = true;
    await rename(stagingDirectory, join(archiveDirectory, "archives"));
    for (const archive of archives) {
      archive.relativePath = `archives/${archive.fileName}`;
    }
    const evidence = {
      version: 1,
      mode: "obbba-law-usc-archive-evidence",
      input: {
        releasePlanProfile: profile.name,
        releasePlanSha256: profile.sha256,
      },
      summary: {
        archives: archives.length,
        titles: new Set(archives.map((entry) => entry.uscTitle)).size,
        totalBytes,
      },
      archives,
    };
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    onProgress({ completed: sources.length, total: sources.length });
    return evidence;
  } catch (error) {
    await rm(archiveDirectoryOwned ? archiveDirectory : stagingDirectory, {
      recursive: true,
      force: true,
    });
    if (cacheRootCreated) {
      try { await rmdir(cacheRoot); } catch { /* retained if no longer empty */ }
    }
    throw error;
  }
}

export function inspectZip(bytes, expectedEntry) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 22) {
    throw new Error("USC source is not a valid ZIP archive.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const lowerBound = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= lowerBound; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  const commentLength = eocd < 0 ? -1 : view.getUint16(eocd + 20, true);
  if (eocd < 0 || eocd + 22 + commentLength !== bytes.length
    || view.getUint16(eocd + 4, true) !== 0
    || view.getUint16(eocd + 6, true) !== 0
    || view.getUint16(eocd + 8, true) !== view.getUint16(eocd + 10, true)
    || view.getUint16(eocd + 10, true) === 0xffff
    || view.getUint32(eocd + 12, true) === 0xffffffff
    || view.getUint32(eocd + 16, true) === 0xffffffff) {
    throw new Error("USC ZIP archive has an unsupported central directory.");
  }
  const count = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (directoryOffset + directorySize > eocd || count === 0) {
    throw new Error("USC ZIP central directory bounds are invalid.");
  }
  const names = new Set();
  let expected;
  let offset = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > eocd || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("USC ZIP central directory entry is invalid.");
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const crc32 = view.getUint32(offset + 16, true).toString(16).padStart(8, "0");
    const compressedBytes = view.getUint32(offset + 20, true);
    const uncompressedBytes = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > eocd || flags & 0x1 || flags & 0x40
      || ![0, 8].includes(method)
      || compressedBytes === 0xffffffff || uncompressedBytes === 0xffffffff
      || localOffset === 0xffffffff || compressedBytes > MAX_ARCHIVE_BYTES
      || uncompressedBytes > 250 * 1024 * 1024) {
      throw new Error("USC ZIP entry is encrypted, oversized, or unsupported.");
    }
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
    if (!name || name.includes("\\") || name.startsWith("/")
      || name.split("/").includes("..") || names.has(name)) {
      throw new Error("USC ZIP contains an unsafe or duplicate entry name.");
    }
    const local = validateLocalEntry({
      bytes,
      view,
      directoryOffset,
      name,
      nameBytes,
      flags,
      method,
      crc32: view.getUint32(offset + 16, true),
      compressedBytes,
      uncompressedBytes,
      localOffset,
    });
    names.add(name);
    if (name === expectedEntry) {
      expected = {
        crc32,
        compressedBytes,
        uncompressedBytes,
        method,
        dataOffset: local.dataOffset,
      };
    }
    offset = end;
  }
  if (offset !== directoryOffset + directorySize || !expected) {
    throw new Error(`USC ZIP is missing expected XML entry: ${expectedEntry}.`);
  }
  return expected;
}

function validateLocalEntry({
  bytes,
  view,
  directoryOffset,
  name,
  nameBytes,
  flags,
  method,
  crc32,
  compressedBytes,
  uncompressedBytes,
  localOffset,
}) {
  if (localOffset + 30 > directoryOffset
    || view.getUint32(localOffset, true) !== 0x04034b50) {
    throw new Error(`USC ZIP local header is invalid for ${name}.`);
  }
  const localFlags = view.getUint16(localOffset + 6, true);
  const localMethod = view.getUint16(localOffset + 8, true);
  const localCrc32 = view.getUint32(localOffset + 14, true);
  const localCompressed = view.getUint32(localOffset + 18, true);
  const localUncompressed = view.getUint32(localOffset + 22, true);
  const localNameLength = view.getUint16(localOffset + 26, true);
  const localExtraLength = view.getUint16(localOffset + 28, true);
  const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
  const dataEnd = dataOffset + compressedBytes;
  if (localFlags !== flags || localMethod !== method
    || localNameLength !== nameBytes.length
    || dataEnd > directoryOffset
    || !bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength)
      .every((value, index) => value === nameBytes[index])) {
    throw new Error(`USC ZIP central/local metadata mismatch for ${name}.`);
  }
  if (!(flags & 0x8)) {
    if (localCrc32 !== crc32 || localCompressed !== compressedBytes
      || localUncompressed !== uncompressedBytes) {
      throw new Error(`USC ZIP central/local sizes mismatch for ${name}.`);
    }
    return { dataOffset };
  }
  // Data-descriptor archives are accepted only when the descriptor immediately
  // following the compressed bytes repeats the central CRC and 32-bit sizes.
  let descriptorOffset = dataEnd;
  if (descriptorOffset + 4 <= directoryOffset
    && view.getUint32(descriptorOffset, true) === 0x08074b50) {
    descriptorOffset += 4;
  }
  if (descriptorOffset + 12 > directoryOffset
    || view.getUint32(descriptorOffset, true) !== crc32
    || view.getUint32(descriptorOffset + 4, true) !== compressedBytes
    || view.getUint32(descriptorOffset + 8, true) !== uncompressedBytes) {
    throw new Error(`USC ZIP data descriptor is invalid for ${name}.`);
  }
  return { dataOffset };
}

function validateCurrentPriorPlan(plan) {
  if (!plan || plan.version !== 3
    || plan.mode !== "obbba-law-usc-release-input-plan"
    || plan.summary?.titles !== 20
    || plan.summary?.sourceArchives !== 40
    || !Array.isArray(plan.titles) || plan.titles.length !== 20) {
    throw new Error("USC release plan has an unexpected schema or summary.");
  }
  const sources = [];
  const identities = new Set();
  for (const title of plan.titles) {
    if (!/^\d{1,2}$/.test(title.uscTitle)) {
      throw new Error("USC release plan contains an invalid title.");
    }
    for (const releaseRole of ["current", "prior"]) {
      const source = title[releaseRole];
      const expectedPoint = releaseRole === "current" ? "119-102" : "118-250not159";
      const expectedBase = releaseRole === "current"
        ? "https://uscode.house.gov/download/releasepoints/us/pl/119/102/"
        : "https://uscode.house.gov/download/releasepoints/us/pl/118/250not159/";
      const expectedName = `usc${title.uscTitle.padStart(2, "0")}.xml`;
      const expectedUrl =
        `${expectedBase}xml_usc${title.uscTitle.padStart(2, "0")}@${expectedPoint}.zip`;
      const identity = `${releaseRole}:${title.uscTitle}`;
      if (!source || source.releasePoint !== expectedPoint
        || source.archiveUrl !== expectedUrl
        || source.expectedArchiveEntry !== expectedName
        || identities.has(identity)) {
        throw new Error("USC release plan contains an invalid source commitment.");
      }
      identities.add(identity);
      sources.push({
        releaseRole,
        uscTitle: title.uscTitle,
        ...source,
      });
    }
  }
  if (sources.length !== 40) throw new Error("USC release plan must contain 40 sources.");
  return sources;
}

function validateIncorporationPlan(plan) {
  if (!plan || plan.version !== 1
    || plan.mode !== "obbba-law-incorporation-window-input-plan"
    || plan.summary?.titles !== 20
    || plan.summary?.uniqueUscTargets !== 332
    || plan.summary?.sourceArchives !== 40
    || !Array.isArray(plan.titles) || plan.titles.length !== 20
    || !/state evidence only/.test(plan.attributionRule)
    || plan.releases?.before?.releasePoint !== "119-27not21"
    || plan.releases?.after?.releasePoint !== "119-31"
    || !/intervening public laws/.test(plan.releases.after.limitation)) {
    throw new Error("USC incorporation-window plan has an unexpected schema.");
  }
  const sources = [];
  const identities = new Set();
  for (const title of plan.titles) {
    if (!/^\d{1,2}$/.test(title.uscTitle)
      || !Array.isArray(title.targetSections) || !title.targetSections.length) {
      throw new Error("USC incorporation-window plan contains an invalid title.");
    }
    for (const releaseRole of ["before", "after"]) {
      const source = title[releaseRole];
      const expectedPoint =
        releaseRole === "before" ? "119-27not21" : "119-31";
      const directory = releaseRole === "before" ? "27not21" : "31";
      const titleNumber = title.uscTitle.padStart(2, "0");
      const expectedUrl =
        `https://uscode.house.gov/download/releasepoints/us/pl/119/${directory}/`
        + `xml_usc${titleNumber}@${expectedPoint}.zip`;
      const expectedName = `usc${titleNumber}.xml`;
      const identity = `${releaseRole}:${title.uscTitle}`;
      if (!source || source.releasePoint !== expectedPoint
        || source.archiveUrl !== expectedUrl
        || source.expectedArchiveEntry !== expectedName
        || identities.has(identity)) {
        throw new Error(
          "USC incorporation-window plan contains an invalid source commitment.",
        );
      }
      identities.add(identity);
      sources.push({
        releaseRole,
        uscTitle: title.uscTitle,
        ...source,
      });
    }
  }
  if (sources.length !== 40) {
    throw new Error("USC incorporation-window plan must contain 40 sources.");
  }
  return sources;
}

function planProfile(planPath) {
  const name = basename(planPath);
  if (name === "OBBBA_LAW_USC_RELEASE_INPUT_PLAN_V3_2026-07-26.json") {
    return {
      name: "current-prior-v3",
      sha256: CURRENT_PRIOR_PLAN_SHA256,
      validate: validateCurrentPriorPlan,
    };
  }
  if (name === "OBBBA_LAW_INCORPORATION_WINDOW_INPUT_PLAN_2026-07-26.json") {
    return {
      name: "incorporation-window-v1",
      sha256: INCORPORATION_PLAN_SHA256,
      validate: validateIncorporationPlan,
    };
  }
  throw new Error("USC release-plan filename is not an approved profile.");
}

async function fetchArchive({ source, fetcher, sleep, deadlineMs }) {
  for (let attempt = 0; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const deadlineAt = Date.now() + deadlineMs;
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(abortError());
      }, deadlineMs);
    });
    let response;
    try {
      response = await Promise.race([
        fetcher(source.archiveUrl, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            Accept: "application/zip",
            "User-Agent": "DiscussionBridge/0.1 (+https://discussionbridge.dev)",
          },
        }),
        deadline,
      ]);
      if (response.status >= 300 && response.status < 400) {
        throw new Error(`OLRC archive redirect blocked: ${response.status}.`);
      }
      const bytes = await readBounded(response, controller, deadlineAt);
      if (response.ok) return bytes;
      if (response.status !== 429 || attempt === 3) {
        throw new Error(`OLRC archive GET failed: ${response.status} ${response.statusText}.`);
      }
      await sleep(rateLimitWaitMs(response.headers.get("retry-after"), bytes, attempt));
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("OLRC archive request deadline exceeded.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
      controller.abort();
      await boundedCancel(response);
    }
  }
  throw new Error("OLRC archive retry boundary failed.");
}

async function readBounded(response, controller, deadlineAt) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_ARCHIVE_BYTES) {
    throw new Error("OLRC archive exceeds the 100 MiB limit.");
  }
  const reader = response.body?.getReader?.();
  if (!reader) throw new Error("OLRC archive response has no readable stream.");
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) throw abortError();
      const result = await withDeadline(reader.read(), remaining);
      if (result.done) break;
      total += result.value.byteLength;
      if (total > MAX_ARCHIVE_BYTES) {
        controller.abort();
        throw new Error("OLRC archive exceeds the 100 MiB limit.");
      }
      chunks.push(result.value);
    }
  } finally {
    await boundedPromise(reader.cancel(), 50);
    try { reader.releaseLock(); } catch { /* already released */ }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function rateLimitWaitMs(retryAfter, bytes, attempt) {
  const waits = [1000 * (2 ** attempt)];
  if (retryAfter?.trim()) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) waits.push(seconds * 1000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) waits.push(Math.max(0, date - Date.now()));
  }
  try {
    const seconds = Number(JSON.parse(new TextDecoder().decode(bytes))?.extras?.wait_seconds);
    if (Number.isFinite(seconds) && seconds >= 0) waits.push(seconds * 1000);
  } catch { /* bounded fallback */ }
  return Math.min(Math.max(...waits), 60_000);
}

async function boundedCancel(response) {
  if (!response?.body) return;
  await boundedPromise(response.body.cancel(), 50);
}

async function boundedPromise(promise, milliseconds) {
  try {
    await withDeadline(Promise.resolve(promise), milliseconds);
  } catch { /* best-effort bounded cleanup */ }
}

function withDeadline(promise, milliseconds) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(abortError()), milliseconds);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function abortError() {
  return Object.assign(new Error("deadline exceeded"), { name: "AbortError" });
}

async function requireAbsent(path, label) {
  try {
    await access(path);
    throw new Error(`USC ${label} already exists: ${path}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`USC ${label} already exists:`)) {
      throw error;
    }
    if (error?.code !== "ENOENT") throw error;
  }
}

function validateCachePath(archiveDirectory, cacheRoot) {
  const root = resolve(cacheRoot);
  const target = resolve(archiveDirectory);
  if (dirname(target) !== root
    || !/^obbba-law-usc-(?:incorporation-)?archives-\d{4}-\d{2}-\d{2}$/
      .test(basename(target))) {
    throw new Error(
      "USC archives must use the dated direct-child path under .discussionbridge-cache.",
    );
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const evidence = await collectObbbaLawUscArchives({
    planPath: "docs/evidence/OBBBA_LAW_USC_RELEASE_INPUT_PLAN_V3_2026-07-26.json",
    archiveDirectory: ".discussionbridge-cache/obbba-law-usc-archives-2026-07-26",
    evidencePath: "docs/evidence/OBBBA_LAW_USC_ARCHIVE_EVIDENCE_2026-07-26.json",
    onProgress: ({ completed, total, source }) => {
      if (source) {
        process.stdout.write(
          `Fetching ${completed + 1}/${total}: ${source.releaseRole} USC ${source.uscTitle}.\n`,
        );
      }
    },
  });
  process.stdout.write(
    `Collected ${evidence.summary.archives} official USC archives `
    + `(${evidence.summary.totalBytes} bytes).\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
