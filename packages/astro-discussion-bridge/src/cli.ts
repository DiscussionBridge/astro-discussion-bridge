#!/usr/bin/env node
import path from "node:path";
import { materializeNativePublications } from "./native-publication.js";

const args = process.argv.slice(2);
if (args.shift() !== "sync-publications") throw new Error("Usage: discussionbridge-astro sync-publications --docs-dir DIR --site-url URL [--route-base comments]");
const values = new Map<string, string>();
while (args.length) {
  const key = args.shift();
  const value = args.shift();
  if (!key?.startsWith("--") || value === undefined) throw new Error("Invalid DiscussionBridge Astro arguments");
  values.set(key.slice(2), value);
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
