import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publishControlledDiscussions } from "../dist/controlled-creation.js";
import { readPublicationOperationalState } from "../dist/operational-state.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

// This is a disposable author-pipeline verifier with an in-process synthetic
// receiver. It never connects to a forum, consumes a real secret, or deploys.
export async function verifyThousandPages({ count = 1000, artifactPath } = {}) {
  if (!Number.isSafeInteger(count) || count < 2 || count > 1000) throw new Error("Count must be 2 through 1000.");
  const parent = path.resolve(os.tmpdir());
  const fixture = await fs.mkdtemp(path.join(parent, "discussionbridge-thousand-pages-"));
  const identity = await fs.lstat(fixture, { bigint: true });
  if (!identity.isDirectory() || identity.isSymbolicLink() || identity.ino <= 0n) throw new Error("Cannot establish owned fixture identity.");
  const docs = path.join(fixture, "pages");
  const stateFile = path.join(fixture, "publication-state.json");
  const members = [];
  const inputMembers = [];
  const receiver = new Map();
  let requests = 0;
  let receiverWrites = 0;
  const priorFetch = globalThis.fetch;
  const options = docsDir => ({ docsDir, stateFile, siteUrl: "https://astro.example/", discourseUrl: "https://forum.example/", controlledCreation: { connectionId: "dbc_aaaaaaaaaaaaaaaaaaaaaaaa", connectionSecret: "synthetic-fixture-secret-never-a-real-key", lane: "local-verifier" } });
  try {
    for (let index = 0; index < count; index++) {
      const name = `page-${String(index).padStart(4, "0")}`;
      const relative = `${name}/index.md`;
      const file = path.join(docs, relative);
      const content = `---\ntitle: Deterministic page ${index}\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\ndate: "2026-01-01T00:00:00Z"\nlastUpdated: "2026-01-01T00:00:00Z"\n---\n# Page ${index}\n\nNative Markdown body ${index}.\n\n| Item | Value |\n| --- | --- |\n| Page | ${index} |\n`;
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, content, { flag: "wx" });
      members.push({ relative, file });
      inputMembers.push({ path: relative, bytes: Buffer.byteLength(content), sha256: sha(content) });
    }
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "https://forum.example/discussion-bridge/v1/bridge-records/resolve.json");
      requests++;
      const payload = JSON.parse(init.body).bridge_record;
      const source = payload.source_publication;
      assert.match(source.revision, /^[0-9a-f]{64}$/u);
      assert.ok(Buffer.byteLength(init.body) <= 65536);
      const existing = receiver.get(payload.external_id);
      let current = existing;
      if (!current) {
        assert.equal(source.previous_revision, null);
        const index = Number(new URL(payload.canonical_url).pathname.match(/page-(\d+)\//u)[1]);
        current = { externalId: payload.external_id, canonicalUrl: payload.canonical_url, resourceId: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`, topicId: index + 1, revision: source.revision };
        receiver.set(payload.external_id, current);
        receiverWrites++;
      } else if (current.revision !== source.revision) {
        assert.equal(source.previous_revision, current.revision);
        current.revision = source.revision;
        receiverWrites++;
      }
      assert.equal(payload.canonical_url, current.canonicalUrl);
      return Response.json({ outcome: existing ? "resolved" : "created", reason: existing ? "existing_bridge_record" : "bridge_record_created", resource_id: current.resourceId, topic_id: current.topicId, topic_url: `https://forum.example/t/page/${current.topicId}`, direction: "to_discourse", core_fallback: false, source_revision: current.revision });
    };
    const initial = await publishControlledDiscussions(options(docs));
    assert.equal(initial.length, count);
    assert.equal(initial.filter(result => result.status === "created").length, count);
    assert.equal(receiver.size, count);
    let state = await readPublicationOperationalState(stateFile);
    assert.equal(Object.keys(state.operations).length, count);
    for (const operation of Object.values(state.operations)) assert.equal(operation.reconciliationRequired, false);

    // Continue one existing native identity; other corpus members must remain
    // byte-identical. Reloading the normal state file exercises restart receipt.
    const first = members[0];
    const continuingOptions = { ...options(path.dirname(first.file)), routeBase: "page-0000" };
    const hashesBefore = await Promise.all(members.slice(1).map(async member => sha(await fs.readFile(member.file))));
    const writesBeforeRetry = receiverWrites;
    const retry = await publishControlledDiscussions(continuingOptions);
    assert.equal(receiverWrites, writesBeforeRetry);
    assert.equal(retry[0].resourceId, initial[0].resourceId);
    await fs.appendFile(first.file, "\nContinuing native edition.\n");
    const update = await publishControlledDiscussions(continuingOptions);
    assert.equal(receiverWrites, count + 1);
    assert.equal(update[0].topicId, initial[0].topicId);

    await fs.appendFile(first.file, "\nEdition accepted before simulated restart.\n");
    await assert.rejects(() => publishControlledDiscussions(continuingOptions, { afterResultStaged: async () => { throw new Error("Synthetic restart after receipt"); } }), /Synthetic restart/u);
    state = await readPublicationOperationalState(stateFile);
    const operation = Object.values(state.operations).find(item => item.topicId === initial[0].topicId);
    assert.equal(operation.reconciliationRequired, true);
    assert.equal(operation.sourceRevision, receiver.get(operation.externalId).revision);
    const acceptedWrites = receiverWrites;
    await publishControlledDiscussions(continuingOptions);
    assert.equal(receiverWrites, acceptedWrites);
    state = await readPublicationOperationalState(stateFile);
    assert.equal(state.operations[operation.externalId].reconciliationRequired, false);
    const beforeDriftRequests = requests;
    const saved = await fs.readFile(first.file, "utf8");
    await fs.writeFile(first.file, saved.replace("title:", "slug: moved-page\ntitle:"));
    await assert.rejects(() => publishControlledDiscussions(continuingOptions), /canonical identity collision/u);
    assert.equal(requests, beforeDriftRequests);
    await fs.writeFile(first.file, saved);
    const hashesAfter = await Promise.all(members.slice(1).map(async member => sha(await fs.readFile(member.file))));
    assert.deepEqual(hashesAfter, hashesBefore);

    const sourceFiles = ["package.json", "dist/controlled-creation.js", "dist/operational-state.js", "dist/server-secret.js", "scripts/verify-thousand-pages.mjs"];
    const sourceIdentity = await Promise.all(sourceFiles.map(async relative => {
      const bytes = await fs.readFile(path.join(packageRoot, relative));
      return { path: relative, bytes: bytes.length, sha256: sha(bytes) };
    }));
    const lock = path.join(packageRoot, "package-lock.json");
    try { const bytes = await fs.readFile(lock); sourceIdentity.push({ path: "package-lock.json", bytes: bytes.length, sha256: sha(bytes) }); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const receipts = [...receiver.values()].sort((a, b) => a.canonicalUrl.localeCompare(b.canonicalUrl));
    const artifactBytes = artifactPath ? await fs.readFile(artifactPath) : null;
    return {
      format: 1, qualification: "synthetic-local-author-pipeline", packageVersion: JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8")).version,
      artifact: artifactBytes ? { filename: path.basename(artifactPath), bytes: artifactBytes.length, sha256: sha(artifactBytes) } : null,
      tool: { node: process.version, platform: process.platform, architecture: process.arch, executableSha256: sha(await fs.readFile(process.execPath)) },
      sourceIdentity, inputMembers, inputDigest: sha(JSON.stringify(inputMembers)), count, requests, receiverWrites,
      census: { created: initial.filter(result => result.status === "created").length, skipped: initial.filter(result => result.status === "skipped").length },
      receipts, operationalState: { schemaVersion: state.schemaVersion, adapterId: state.adapterId, sha256: sha(JSON.stringify(state)), operations: Object.keys(state.operations).length },
      assertions: { continuingEdition: true, sameRevisionRetryNoSyntheticRewrite: true, stagedReceiptRestart: true, canonicalDriftRejectedBeforeRequest: true, unrelatedMembersUnchanged: true },
      publication: { verified: true, boundary: "native Markdown + supported controlled creation + in-process synthetic receiver" },
      publicVerification: { verified: false, reason: "No native forum, Astro static output, browser or public deployment was used." },
    };
  } finally {
    globalThis.fetch = priorFetch;
    const current = await fs.lstat(fixture, { bigint: true });
    if (path.dirname(fixture) !== parent || !path.basename(fixture).startsWith("discussionbridge-thousand-pages-") || !current.isDirectory() || current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino) throw new Error("Refusing cleanup of replaced fixture root.");
    await fs.rm(fixture, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if ((args.length !== 2 && args.length !== 4) || args[0] !== "--evidence" || (args.length === 4 && args[2] !== "--artifact")) throw new Error("Usage: node scripts/verify-thousand-pages.mjs --evidence /absolute/new-evidence.json [--artifact /absolute/package.tgz]");
  if (!path.isAbsolute(args[1])) throw new Error("Evidence path must be absolute.");
  if (args[3] && !path.isAbsolute(args[3])) throw new Error("Artifact path must be absolute.");
  const evidence = await verifyThousandPages({ artifactPath: args[3] });
  await fs.writeFile(args[1], `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ qualification: evidence.qualification, count: evidence.count, requests: evidence.requests, receiverWrites: evidence.receiverWrites, publicVerified: false, evidence: path.resolve(args[1]) }));
}
