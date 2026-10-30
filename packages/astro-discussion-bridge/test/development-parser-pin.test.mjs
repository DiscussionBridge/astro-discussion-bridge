import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the approved native parser correction stays in the development dependency graph", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(manifest.overrides.satteri, "0.11.6");
  assert.equal(manifest.dependencies.satteri, undefined);
  assert.equal(manifest.peerDependencies.satteri, undefined);
  const parserMembers = Object.entries(lock.packages).filter(([name]) => /(?:^|\/)node_modules\/(?:satteri|@bruits\/satteri-[^/]+)$/u.test(name));
  assert.ok(parserMembers.length > 0, "the ordinary lock must include the native development parser");
  for (const [name, member] of parserMembers) {
    assert.equal(member.version, "0.11.6", name);
    assert.equal(member.dev, true, `${name} must not become a production dependency`);
  }
});
