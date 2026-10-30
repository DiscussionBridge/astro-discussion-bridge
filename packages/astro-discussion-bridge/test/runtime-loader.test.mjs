import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("test-only runtime hook resolves installed bare dependencies without recursive hook entry", async () => {
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  const script = `import { createRequire } from 'node:module';
const local = createRequire(import.meta.url);
const names = ['proper-lockfile','sanitize-html','@astrojs/markdown-remark','dompurify','yaml','astro','sharp'];
const paths = Object.fromEntries(names.map(name => [name, local.resolve(name)]));
const yaml = await import('yaml');
if (yaml.parse('checked: true').checked !== true) throw new Error('Actual imported dependency did not execute.');
console.log(JSON.stringify(paths));`;
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ["--import", new URL("./register-runtime.mjs", import.meta.url).href, "--input-type=module", "--eval", script], { cwd, windowsHide: true, timeout: 15_000 });
  assert.equal(stderr, "");
  const paths = JSON.parse(stdout);
  assert.equal(Object.keys(paths).length, 7);
  for (const value of Object.values(paths)) assert.match(value.replaceAll("\\", "/"), /\/node_modules\//u);
});
