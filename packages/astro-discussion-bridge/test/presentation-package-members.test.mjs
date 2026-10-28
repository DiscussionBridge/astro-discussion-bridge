import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
function selected(relative) {
  // These tested entries are literal files/directories in the package manifest.
  return manifest.files.some(entry => relative === entry || relative.startsWith(`${entry}/`));
}
async function assertSelectedRegular(relative) {
  assert.ok(selected(relative), `${relative} is absent from package files selection`);
  assert.ok((await stat(path.join(root, relative))).isFile(), `${relative} is not an existing package file`);
}

test("packaged Astro component imports retain their exact topic identity source dependency", async () => {
  for (const name of ["DiscourseDiscussion", "DiscourseReplies"]) {
    const entry = manifest.exports[`./${name}.astro`]; assert.equal(typeof entry, "string");
    const relative = entry.replace(/^\.\//u, ""); await assertSelectedRegular(relative);
    const contents = await readFile(path.join(root, relative), "utf8");
    const match = /from\s+["'](\.\.\/topic-identity)["']/u.exec(contents); assert.ok(match, `${name} helper import is missing`);
    const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(relative), `${match[1]}.ts`));
    await assertSelectedRegular(dependency);
  }
});

test("consumed compiled public entries retain their packaged exact topic helper", async () => {
  for (const key of ["./simple-live", "./web-url"]) {
    const relative = manifest.exports[key].import.replace(/^\.\//u, ""); await assertSelectedRegular(relative);
    const contents = await readFile(path.join(root, relative), "utf8");
    const match = /from\s+["'](\.\/topic-identity\.js)["']/u.exec(contents); assert.ok(match, `${key} helper import is missing`);
    await assertSelectedRegular(path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1])));
  }
});
