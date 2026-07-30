import { access, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { buildObbbaLawAuthorityMap } from "./obbba-law-authority-map-lib.mjs";

const CLASSIFICATION_URL =
  "https://uscode.house.gov/classification/tbl119pl_1st.htm";
const METADATA_SHA256 =
  "434761fa42bbd67e2b9b6b8e1523d87fb85b238a5e376c0d6c5ab004e0a16f67";
const MAX_BYTES = 10 * 1024 * 1024;

export async function runObbbaLawAuthorityMap({
  metadataPath,
  outputPath,
  fetcher = globalThis.fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  onRateLimit = () => undefined,
  expectedMetadataSha256 = METADATA_SHA256,
}) {
  await requireAbsent(outputPath);
  const forumMetadataText = await readFile(metadataPath, "utf8");
  const metadataHash = await sha256(forumMetadataText);
  if (metadataHash !== expectedMetadataSha256) {
    throw new Error("Approved Law as Amended forum metadata byte commitment does not match.");
  }
  const classificationDocumentText = await fetchOlrcClassification({
    fetcher,
    sleep,
    onRateLimit,
  });
  const authorityMap = buildObbbaLawAuthorityMap({
    forumMetadataText,
    classificationDocumentText,
  });
  await writeFile(outputPath, `${JSON.stringify(authorityMap, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return authorityMap;
}

export async function fetchOlrcClassification({
  fetcher = globalThis.fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  onRateLimit = () => undefined,
  deadlineMs = 5_000,
}) {
  for (let attempt = 0; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    let deadlineTimer;
    const deadline = new Promise((_, reject) => {
      deadlineTimer = setTimeout(() => {
        controller.abort();
        reject(new Error("OLRC classification request deadline exceeded."));
      }, deadlineMs);
    });
    let response;
    try {
      response = await Promise.race([
        fetcher(CLASSIFICATION_URL, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            Accept: "text/html;charset=utf-8",
            "User-Agent": "DiscussionBridge/0.1 (+https://discussionbridge.dev)",
          },
        }),
        deadline,
      ]);
      if (response.status >= 300 && response.status < 400) {
        throw new Error(`OLRC classification redirect blocked: ${response.status}.`);
      }
      const bytes = await readBoundedBytes(response, controller, deadline);
      if (response.ok) {
        if (!bytes.length) throw new Error("OLRC classification response is empty.");
        try {
          return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
          throw new Error("OLRC classification response is not valid UTF-8.");
        }
      }
      if (response.status !== 429 || attempt === 3) {
        throw new Error(`OLRC classification GET failed: ${response.status} ${response.statusText}.`);
      }
      const body = new TextDecoder().decode(bytes);
      const waitMs = rateLimitWaitMs(response.headers.get("retry-after"), body, attempt);
      onRateLimit(waitMs, attempt + 1, 3);
      await sleep(waitMs);
    } finally {
      clearTimeout(deadlineTimer);
      controller.abort();
      if (response) await boundedCancel(response);
    }
  }
  throw new Error("OLRC classification retry boundary failed.");
}

function rateLimitWaitMs(retryAfter, body, attempt) {
  const waits = [1000 * (2 ** attempt)];
  if (retryAfter?.trim()) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) waits.push(seconds * 1000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) waits.push(Math.max(0, date - Date.now()));
  }
  try {
    const seconds = Number(JSON.parse(body)?.extras?.wait_seconds);
    if (Number.isFinite(seconds) && seconds >= 0) waits.push(seconds * 1000);
  } catch {
    // The bounded fallback remains authoritative for non-JSON bodies.
  }
  return Math.min(Math.max(...waits), 60_000);
}

async function readBoundedBytes(response, controller, deadline) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
    throw new Error("OLRC classification response exceeds 10 MiB.");
  }
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await Promise.race([reader.read(), deadline]);
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          controller.abort();
          await boundedReaderCancel(reader);
          throw new Error("OLRC classification response exceeds 10 MiB.");
        }
        chunks.push(value);
      }
    } catch (error) {
      controller.abort();
      await boundedReaderCancel(reader);
      if (error instanceof Error && /deadline exceeded|exceeds 10 MiB/.test(error.message)) {
        throw error;
      }
      throw new Error("OLRC classification response body could not be read.");
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // The stream may already be errored or cancelled.
      }
    }
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }

  // Controlled injected test responses may not implement a Web ReadableStream.
  try {
    const buffer = await Promise.race([response.arrayBuffer(), deadline]);
    const bytes = new Uint8Array(buffer);
    if (bytes.length > MAX_BYTES) throw new Error("OLRC classification response exceeds 10 MiB.");
    return bytes;
  } catch (error) {
    if (error instanceof Error && /deadline exceeded|exceeds 10 MiB/.test(error.message)) throw error;
    throw new Error("OLRC classification response body could not be read.");
  }
}

async function boundedReaderCancel(reader) {
  try {
    await withTimeout(reader.cancel(), 50);
  } catch {
    // Reader cancellation is best-effort and bounded.
  }
}

async function boundedCancel(response) {
  try {
    if (response.body) await withTimeout(response.body.cancel(), 50);
  } catch {
    // Cleanup is best-effort and bounded.
  }
}

async function withTimeout(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(undefined), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function requireAbsent(filePath) {
  try {
    await access(filePath);
    throw new Error(`Law authority map already exists: ${filePath}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Law authority map already exists:")) {
      throw error;
    }
    if (error?.code !== "ENOENT") throw error;
  }
}

async function sha256(value) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const metadataPath =
    "docs/evidence/OBBBA_LAW_AS_AMENDED_FORUM_METADATA_2026-07-26.json";
  const outputPath =
    "docs/evidence/OBBBA_LAW_OFFICIAL_AUTHORITY_MAP_2026-07-26.json";
  const authorityMap = await runObbbaLawAuthorityMap({
    metadataPath,
    outputPath,
    onRateLimit: (waitMs, retry, maximum) => {
      process.stdout.write(
        `OLRC rate limited; waiting ${Math.ceil(waitMs / 1000)}s `
        + `(retry ${retry}/${maximum}).\n`,
      );
    },
  });
  process.stdout.write(
    `OBBBA Law authority map: ${authorityMap.summary.total} sections; `
    + `${authorityMap.summary.classifiedToUsCode} classified to U.S. Code; `
    + `${authorityMap.summary.noUsCodeClassificationRecord} without a U.S. Code classification record.\n`
    + `Written create-only: ${outputPath}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
