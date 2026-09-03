#!/usr/bin/env node
import path from "node:path";
import { materializeNativePublications } from "./native-publication.js";
import { readPublicationOperationalState, summarizePublicationOperationalState } from "./operational-state.js";

const args = process.argv.slice(2);
const command = args.shift();
if (command !== "sync-publications" && command !== "publication-status") throw new Error("Usage: discussionbridge-astro sync-publications|publication-status [options]");
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
const docsDir = values.get("docs-dir");
const siteUrl = values.get("site-url");
if (!docsDir || !siteUrl) throw new Error("Astro docs directory and site URL are required");
const summary = await materializeNativePublications({
  docsDir: path.resolve(docsDir),
  siteUrl,
  routeBase: values.get("route-base") ?? "comments",
  serverUrl: process.env.DISCUSSIONBRIDGE_SERVER_URL ?? "",
  connectionId: process.env.DISCUSSIONBRIDGE_CONNECTION_ID ?? "",
  connectionSecret: process.env.DISCUSSIONBRIDGE_CONNECTION_SECRET ?? "",
});
process.stdout.write(`${JSON.stringify(summary)}\n`);
if (summary.failed) process.exitCode = 1;
