#!/usr/bin/env node
import path from "node:path";
import { readFile } from "node:fs/promises";
import { materializeNativePublications, migrateNativePublication } from "./native-publication.js";
import { readPublicationOperationalState, summarizePublicationOperationalState } from "./operational-state.js";
import { finalizeAstroPublicationWork, prepareAstroPublicationWork } from "./publication-work.js";

const args = process.argv.slice(2);
const command = args.shift();
if (!new Set(["sync-publications", "publication-status", "migrate-publication", "prepare-publication-work", "finalize-publication-work"]).has(command ?? "")) throw new Error("Usage: discussionbridge-astro sync-publications|publication-status|migrate-publication|prepare-publication-work|finalize-publication-work [options]");
const values = new Map<string, string>();
while (args.length) {
  const key = args.shift();
  const value = args.shift();
  if (!key?.startsWith("--") || value === undefined) throw new Error("Invalid DiscussionBridge Astro arguments");
  values.set(key.slice(2), value);
}
if (command === "publication-status") {
  const stateFile = values.get("state-file");
  if (!stateFile) throw new Error("Astro publication state file is required.");
  process.stdout.write(`${JSON.stringify(summarizePublicationOperationalState(await readPublicationOperationalState(path.resolve(stateFile))))}\n`);
  process.exit(0);
}
if (command === "migrate-publication") {
  const required = ["docs-dir", "site-url", "resource-id", "old-url", "new-url", "redirects-file"];
  if (required.some((name) => !values.get(name))) throw new Error(`Astro publication migration requires ${required.map((name) => `--${name}`).join(", ")}`);
  const result = await migrateNativePublication({
    docsDir: path.resolve(values.get("docs-dir")!),
    siteUrl: values.get("site-url")!,
    resourceId: values.get("resource-id")!,
    oldUrl: values.get("old-url")!,
    newUrl: values.get("new-url")!,
    redirectsFile: path.resolve(values.get("redirects-file")!),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}
const docsDir = values.get("docs-dir");
const siteUrl = values.get("site-url");
const stateFile = values.get("state-file");
if (!docsDir || !siteUrl) throw new Error("Astro docs directory and site URL are required");
const secretFile = process.env.DISCUSSIONBRIDGE_CONNECTION_SECRET_FILE;
const connectionSecret = secretFile
  ? (await readFile(secretFile, "utf8")).trim()
  : process.env.DISCUSSIONBRIDGE_CONNECTION_SECRET ?? "";
const sectionsFile = values.get("sections-file");
const sections = sectionsFile
  ? JSON.parse(await readFile(path.resolve(sectionsFile), "utf8"))
  : [];
if (command === "prepare-publication-work" || command === "finalize-publication-work") {
  if (!stateFile) throw new Error("Astro publication-work state file is required");
  const operation = command === "prepare-publication-work"
    ? prepareAstroPublicationWork
    : finalizeAstroPublicationWork;
  const summary = await operation({
    docsDir: path.resolve(docsDir),
    stateFile: path.resolve(stateFile),
    siteUrl,
    routeBase: values.get("route-base") ?? "topics",
    sections,
    serverUrl: process.env.DISCUSSIONBRIDGE_SERVER_URL ?? "",
    connectionId: process.env.DISCUSSIONBRIDGE_CONNECTION_ID ?? "",
    connectionSecret,
    lane: process.env.DISCUSSIONBRIDGE_LANE,
    maximum: integerOption(values.get("limit"), 20, 1, 200, "publication work limit"),
    requestDelayMs: integerOption(values.get("request-delay-ms"), 0, 0, 5000, "request delay"),
  });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (summary.failed) process.exitCode = 1;
  process.exit();
}
const summary = await materializeNativePublications({
  docsDir: path.resolve(docsDir),
  siteUrl,
  routeBase: values.get("route-base") ?? "comments",
  serverUrl: process.env.DISCUSSIONBRIDGE_SERVER_URL ?? "",
  connectionId: process.env.DISCUSSIONBRIDGE_CONNECTION_ID ?? "",
  connectionSecret,
});
process.stdout.write(`${JSON.stringify(summary)}\n`);
if (summary.failed) process.exitCode = 1;

function integerOption(value: string | undefined, fallback: number, minimum: number, maximum: number, label: string) {
  if (value === undefined) return fallback;
  if (!/^\d+$/u.test(value)) throw new Error(`Invalid Astro ${label}`);
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) throw new Error(`Invalid Astro ${label}`);
  return result;
}
