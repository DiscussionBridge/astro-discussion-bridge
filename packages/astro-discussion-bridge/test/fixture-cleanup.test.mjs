import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";

// Evaluate the actual helper with synthetic filesystem effects: refusal tests
// must never select a real unrelated directory for recursive deletion.
const helperSource = await readFile(new URL("./helpers/owned-temp.mjs", import.meta.url), "utf8");
const helperBody = helperSource
  .replace(/^import[^\n]+;\r?\n/gm, "")
  .replace("export async function ownedTempFixture", "async function ownedTempFixture");
assert.doesNotMatch(helperBody, /^\s*(?:import|export)\b/m);
const instantiateHelper = new Function("lstat", "mkdtemp", "rm", "os", "path", `${helperBody}\nreturn ownedTempFixture;`);

function fixtureEntry({ dev = 1n, ino = 9_007_199_254_740_993n, directory = true, symlink = false } = {}) {
  return { dev, ino, isDirectory: () => directory, isSymbolicLink: () => symlink };
}

function syntheticFixture({ allocated = fixtureEntry(), current = fixtureEntry(), root } = {}) {
  const parent = path.resolve("synthetic-fixture-parent");
  const prefix = "discussionbridge-astro-native-";
  const target = root ?? path.join(parent, `${prefix}synthetic`);
  const effects = { allocations: [], stats: [], removals: [], hooks: [] };
  const helper = instantiateHelper(
    async (name, options) => {
      effects.stats.push({ name, options });
      return effects.hooks.length === 0 ? allocated : current;
    },
    async (name) => { effects.allocations.push(name); return target; },
    async (name, options) => { effects.removals.push({ name, options }); },
    { tmpdir: () => parent },
    path,
  );
  const allocate = () => helper({ after: (hook) => { effects.hooks.push(hook); } }, prefix);
  return { parent, prefix, target, effects, helper, allocate };
}

test("owned fixture cleanup binds the exact BigInt allocation identity", async () => {
  const fixture = syntheticFixture();
  assert.equal(await fixture.allocate(), fixture.target);
  assert.equal(fixture.effects.hooks.length, 1);
  await fixture.effects.hooks[0]();
  assert.deepEqual(fixture.effects.stats, [
    { name: fixture.target, options: { bigint: true } },
    { name: fixture.target, options: { bigint: true } },
  ]);
  assert.deepEqual(fixture.effects.removals, [{ name: fixture.target, options: { recursive: true, force: true } }]);
});

for (const [reason, current] of [
  ["same-path different inode above Number precision", fixtureEntry({ ino: 9_007_199_254_740_992n })],
  ["same-path different device", fixtureEntry({ dev: 2n })],
  ["same-path symlink", fixtureEntry({ symlink: true })],
  ["same-path non-directory", fixtureEntry({ directory: false })],
]) {
  test(`owned fixture cleanup preserves an unrelated replacement: ${reason}`, async () => {
    const fixture = syntheticFixture({ current });
    await fixture.allocate();
    await assert.rejects(fixture.effects.hooks[0], /Refusing cleanup of a replaced fixture root/);
    assert.deepEqual(fixture.effects.removals, [], "unrelated replacement must not be selected for recursive removal");
  });
}

for (const [reason, allocated] of [
  ["missing inode identity", fixtureEntry({ ino: 0n })],
  ["non-BigInt identity", fixtureEntry({ ino: 42 })],
  ["allocation symlink", fixtureEntry({ symlink: true })],
  ["allocation non-directory", fixtureEntry({ directory: false })],
]) {
  test(`owned fixture cleanup refuses an unqualified allocation: ${reason}`, async () => {
    const fixture = syntheticFixture({ allocated });
    await assert.rejects(fixture.allocate, /Cannot establish owned fixture directory identity/);
    assert.deepEqual(fixture.effects.hooks, []);
    assert.deepEqual(fixture.effects.removals, []);
  });
}

for (const root of [path.resolve("outside-parent", "discussionbridge-astro-native-synthetic"), path.resolve("synthetic-fixture-parent", "unrelated-directory")]) {
  test(`owned fixture cleanup refuses an out-of-bound target: ${path.basename(root)}`, async () => {
    const fixture = syntheticFixture({ root });
    await fixture.allocate();
    await assert.rejects(fixture.effects.hooks[0], /Refusing cleanup outside the exact owned fixture root/);
    assert.deepEqual(fixture.effects.removals, []);
  });
}

test("owned fixture cleanup refuses an unsafe prefix before allocation", async () => {
  const fixture = syntheticFixture();
  await assert.rejects(() => fixture.helper({ after: () => assert.fail("no hook may be registered") }, "../unrelated-"), /plain DiscussionBridge name/);
  assert.deepEqual(fixture.effects.allocations, []);
  assert.deepEqual(fixture.effects.removals, []);
});

for (const fails of [false, true]) {
  test(`owned fixture cleanup preserves unrelated state after a ${fails ? "failing" : "passing"} test`, async (t) => {
    const parent = await ownedTempFixture(t, "discussionbridge-astro-fixture-check-");
    const sentinel = path.join(parent, "sentinel.txt");
    await writeFile(sentinel, "unrelated sentinel\n");
    const script = `
      import assert from "node:assert/strict";
      import { writeFile } from "node:fs/promises";
      import path from "node:path";
      import test from "node:test";
      import { ownedTempFixture } from ${JSON.stringify(new URL("./helpers/owned-temp.mjs", import.meta.url).href)};
      test("owned fixture teardown", async (t) => {
        const root = await ownedTempFixture(t, "discussionbridge-astro-native-");
        await writeFile(path.join(root, "fixture.txt"), "synthetic fixture");
        console.log("OWNED_TEMP:" + JSON.stringify(root));
        assert.equal(${!fails}, true, "deliberate fixture assertion failure");
      });
    `;
    const child = spawn(process.execPath, ["--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      env: { ...process.env, TEMP: parent, TMP: parent, TMPDIR: parent },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    const [exitCode] = await once(child, "close");
    assert.equal(exitCode, fails ? 1 : 0, output);
    const line = output.split(/\r?\n/).find((entry) => entry.includes("OWNED_TEMP:"));
    assert.ok(line, output);
    const root = JSON.parse(line.slice(line.indexOf("OWNED_TEMP:") + "OWNED_TEMP:".length));
    assert.equal(path.dirname(root), parent);
    assert.match(path.basename(root), /^discussionbridge-astro-native-/);
    if (fails) assert.match(output, /deliberate fixture assertion failure/);
    assert.deepEqual(await readdir(parent), ["sentinel.txt"], "the owned root must be removed even when its test fails");
    assert.equal(await readFile(sentinel, "utf8"), "unrelated sentinel\n");
  });
}
