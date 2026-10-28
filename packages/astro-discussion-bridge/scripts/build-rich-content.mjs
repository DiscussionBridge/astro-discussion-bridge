import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dependencyRoot = process.env.DISCUSSIONBRIDGE_BUILD_DEPENDENCY_ROOT ?? root;
const require = createRequire(import.meta.url);
const { build } = require(require.resolve("esbuild", { paths: [dependencyRoot] }));
const result = await build({
  absWorkingDir: root,
  entryPoints: ["src/browser-rich-content.mjs"],
  outfile: "src/assets/discussionbridge-rich-content.js",
  bundle: true, format: "iife", minify: true,
  nodePaths: [path.join(dependencyRoot, "node_modules")],
  // Fonts remain part of the selected local CSS, with no CDN dependency.
  loader: { ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl" },
  metafile: true,
});
const dependencies = {};
for (const name of ["esbuild", "mermaid", "katex", "dompurify"]) {
  const file = path.join(dependencyRoot, "node_modules", name, "package.json");
  const metadata = JSON.parse(fs.readFileSync(file, "utf8"));
  dependencies[name] = { version: metadata.version, license: metadata.license };
  if (name === "mermaid" || name === "katex") {
    fs.copyFileSync(path.join(path.dirname(file), "LICENSE"), path.join(root, `src/assets/${name.toUpperCase()}_LICENSE.txt`));
  }
}
const digest = relative => {
  const bytes = fs.readFileSync(path.join(root, relative));
  return { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
};
const notices = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  let directory = path.dirname(path.resolve(root, input));
  while (directory !== path.dirname(directory)) {
    const manifest = path.join(directory, "package.json");
    if (fs.existsSync(manifest)) {
      const metadata = JSON.parse(fs.readFileSync(manifest, "utf8"));
      if (directory !== root && typeof metadata.name === "string" && typeof metadata.version === "string") {
        const key = `${metadata.name}@${metadata.version}`;
        if (!notices.has(key)) {
          const license = fs.readdirSync(directory).find(file => /^licen[cs]e(?:\.(?:md|txt))?$/i.test(file));
          const text = license ? fs.readFileSync(path.join(directory, license), "utf8") : `License declared by package: ${JSON.stringify(metadata.license)}\nSource: ${JSON.stringify(metadata.repository)}\n`;
          const relative = `src/assets/THIRD_PARTY_LICENSES/${key.replace(/[^a-zA-Z0-9_.-]/g, "_")}.txt`;
          fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
          fs.writeFileSync(path.join(root, relative), text);
          notices.set(key, { name: metadata.name, version: metadata.version, license: metadata.license, file: relative, ...digest(relative) });
        }
      }
      break;
    }
    directory = path.dirname(directory);
  }
}
fs.writeFileSync(path.join(root, "src/assets/RICH_CONTENT_PROVENANCE.json"), `${JSON.stringify({
  format: 1, build: "local declared dependency runtime; newly bundled native browser source; not cold-install proof", dependencies,
  bundledPackages: [...notices.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([, value]) => value),
  inputs: Object.fromEntries(["package.json", "src/browser-rich-content.mjs", "scripts/build-rich-content.mjs"].map(file => [file, digest(file)])),
  outputs: Object.fromEntries(["src/assets/discussionbridge-rich-content.js", "src/assets/discussionbridge-rich-content.css", "src/assets/MERMAID_LICENSE.txt", "src/assets/KATEX_LICENSE.txt"].map(file => [file, digest(file)])),
}, null, 2)}\n`);
