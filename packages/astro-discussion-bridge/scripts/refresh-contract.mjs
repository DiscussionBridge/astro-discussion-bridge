import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { preflightFile } from "./managed-output.mjs";

// Offline maintainer operation only; ordinary installation consumes these bytes.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = "src/private", ledgerPath = `${base}/PROVENANCE.json`;
const pins = Object.freeze({
  commit: "09d77c0209835c2d996aad294d161f167c7bd838",
  candidate: "discussionbridge-v4-core-20261029-r7",
  artifacts: "8b8be89df45117a1270ee6a317cb85f5646b04df2d42e59a3297bca9b3640657",
  normative: "808042688cbde88fac0acdf1187e4cb8c251e13025bfcf09cf3a3c361ca02003",
  runtime: "acdfddf574910fb7e6cf2e2fe6837b3d266e8d93f1d96cee5e7699122d779076",
  schema: "e6a15a6d70f7bc8b8ee82aa22a0b9c2ff1bbf2da6277f7087118be9e026ce5c0",
  idna: "2f2a7bce6697e9ed73d2dacd29e244467e3162066d012b7801939032d0847d1e",
  notices: "21fed045273e053184af7f129c5eccd3d24529b04540c2494c8eb5254d46f331",
});
const initial = {
  [`${base}/ARTIFACTS.json`]: "b32ef07680b05f3f6a113a3a7c6559c0ca567af2cb23bf0fc9551cce7adf84a3",
  [`${base}/CANDIDATE.json`]: "b67d0ead78f331b0489a5f850ec6a5bbb047c1cdaf757ed60b00d88433616263",
  [`${base}/ROUTES.md`]: "091711d740c036dca4be96f93d86a9b8da534b46021cd34469c90f602191222d",
  [`${base}/cms-runtime.mjs`]: "e1790fd800abcae9772d327625ea188f04ec68c63ce7917cb0785f5cdea22538",
  [`${base}/cms-schema.json`]: "8563a9b1346e3bf82635bd65a46bb1e25415a1003d7432f8fcb8c1c6e4f03c14",
};
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function read(directory, relative) {
  assert(preflightFile(directory, relative), `Missing regular source: ${relative}`);
  return fs.readFileSync(path.join(directory, relative));
}
const sources = [
  ["ARTIFACTS.json", "ARTIFACTS.json"], ["CANDIDATE.json", "CANDIDATE.json"], ["ROUTES.md", "ROUTES.md"],
  ["src/cms-runtime.mjs", "cms-runtime.mjs"], ["src/cms-schema.json", "cms-schema.json"],
  ["src/js-idna/DEPENDENCIES.json", "idna/DEPENDENCIES.json"], ["src/js-idna/LICENSES.txt", "idna/LICENSES.txt"],
];
const fixturePins = {
  "positive-examples.json": "b3ea942e9fe6b824ab2a0af5f4eecf46b672d544856fea53929d60a359225b30",
  "url-domain-policy.json": "e6fa88694fe1142f8754c2e50cbee752a9755d63324247aaa9db465450d5672e",
  "url-contextj.json": "5cf9aee605cd002a75d929da35fe0f6bcb99b2dd83a78a71751dc24b95adadd8",
};
function check() {
  const ledger = JSON.parse(read(root, ledgerPath));
  assert.equal(ledger.source_commit, pins.commit); assert.equal(ledger.source_artifacts_sha256, pins.artifacts);
  assert.equal(ledger.candidate_id, pins.candidate); assert.equal(ledger.members.length, sources.length);
  for (const [source, suffix] of sources) {
    const target = `${base}/${suffix}`, member = ledger.members.find(m => m.source === source && m.target === target);
    assert(member, `Unbound current member: ${target}`);
    const bytes = read(root, target); assert.equal(bytes.length, member.bytes); assert.equal(hash(bytes), member.sha256);
  }
  assert.equal(ledger.test_fixture_members.length, Object.keys(fixturePins).length);
  for (const [name, expected] of Object.entries(fixturePins)) {
    const member = ledger.test_fixture_members.find(m => m.source === `fixtures/${name}` && m.target === `test/fixtures/cms-v4/${name}`);
    assert(member); const bytes = read(root, member.target); assert.equal(bytes.length, member.bytes); assert.equal(hash(bytes), expected); assert.equal(member.sha256, expected);
  }
  for (const [file, expected] of [["ARTIFACTS.json", pins.artifacts], ["cms-runtime.mjs", pins.runtime], ["cms-schema.json", pins.schema], ["idna/DEPENDENCIES.json", pins.idna], ["idna/LICENSES.txt", pins.notices]]) assert.equal(hash(read(root, `${base}/${file}`)), expected);
  const candidate = JSON.parse(read(root, `${base}/CANDIDATE.json`));
  assert.equal(candidate.candidate_id, pins.candidate); assert.equal(candidate.normative.sha256, pins.normative);
  assert.match(read(root, `${base}/cms-runtime.d.mts`).toString("utf8"), new RegExp(`candidateId: "${pins.candidate}"`));
  return { source_commit: pins.commit, candidate: pins.candidate, members: ledger.members.length, result: "exact" };
}
const args = process.argv.slice(2);
if (args.length === 2 && args[0] === "--source") {
  preflightFile(root, ledgerPath);
  for (const [, suffix] of sources) preflightFile(root, `${base}/${suffix}`);
  const source = path.resolve(args[1]), artifactBytes = read(source, "ARTIFACTS.json");
  assert.equal(hash(artifactBytes), pins.artifacts, "Wrong shared artifact set");
  const artifacts = JSON.parse(artifactBytes);
  assert.equal(artifacts.candidate_id, pins.candidate); assert.equal(artifacts.normative.sha256, pins.normative);
  const prior = new Map(Object.entries(initial));
  if (preflightFile(root, ledgerPath)) {
    const old = JSON.parse(read(root, ledgerPath));
    for (const member of [...old.members, ...(old.test_fixture_members ?? [])]) {
      const bytes = read(root, member.target); assert.equal(bytes.length, member.bytes); assert.equal(hash(bytes), member.sha256, `Modified owned member: ${member.target}`); prior.set(member.target, member.sha256);
    }
  }
  const staged = sources.map(([from, suffix]) => {
    const bytes = read(source, from), target = `${base}/${suffix}`;
    const expected = artifacts.members.find(m => m.path === from) ?? (from === "src/js-idna/DEPENDENCIES.json" ? artifacts.javascript_dependencies : from === "src/js-idna/LICENSES.txt" ? { sha256: pins.notices, bytes: bytes.length } : null);
    if (expected) { assert.equal(bytes.length, expected.bytes); assert.equal(hash(bytes), expected.sha256); }
    if (preflightFile(root, target)) { const old = read(root, target); assert(old.equals(bytes) || hash(old) === prior.get(target), `Unowned/modified output: ${target}`); }
    return { source: from, target, bytes };
  });
  const fixtureWrites = Object.entries(fixturePins).map(([name, expected]) => {
    const from = `fixtures/${name}`, target = `test/fixtures/cms-v4/${name}`, bytes = read(source, from);
    assert.equal(hash(bytes), expected);
    if (preflightFile(root, target)) { const old = read(root, target); assert(old.equals(bytes) || hash(old) === prior.get(target), `Unowned/modified fixture: ${target}`); }
    return { source: from, target, bytes };
  });
  // Everything needed for refusal, including the final ledger, is checked before writes.
  for (const item of [...staged, ...fixtureWrites]) preflightFile(root, item.target);
  preflightFile(root, ledgerPath);
  assert.match(read(root, `${base}/cms-runtime.d.mts`).toString("utf8"), new RegExp(`candidateId: "${pins.candidate}"`));
  for (const item of [...staged, ...fixtureWrites]) { fs.mkdirSync(path.dirname(path.join(root, item.target)), { recursive: true }); fs.writeFileSync(path.join(root, item.target), item.bytes); }
  const records = items => items.map(({ bytes, ...member }) => ({ ...member, bytes: bytes.length, sha256: hash(bytes) }));
  fs.writeFileSync(path.join(root, ledgerPath), JSON.stringify({ format: 1, source_repository: "https://github.com/DiscussionBridge/discussionbridge-adapter-contract", source_commit: pins.commit, source_artifacts_sha256: pins.artifacts, candidate_id: pins.candidate, members: records(staged), test_fixture_members: records(fixtureWrites) }, null, 2) + "\n");
} else assert(args.length === 1 && args[0] === "--check", "Use --check or explicit offline --source SHARED_DIRECTORY");
console.log(JSON.stringify(check()));
