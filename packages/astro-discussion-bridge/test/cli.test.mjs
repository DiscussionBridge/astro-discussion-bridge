import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("CLI accepts --post-as and reports the selected request actor", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-cli-post-as-"));
  const docsDir = path.join(dir, "docs");

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      path.join(docsDir, "actor.md"),
      [
        "---",
        'title: "Discussion Bridge Request Actor Test"',
        "---",
        "",
        "This dry run verifies the selected Discourse request actor.",
      ].join("\n"),
    );

    const { stdout } = await execFileAsync(
      process.execPath,
      [
        path.resolve("dist/cli.js"),
        "publish-new",
        docsDir,
        "--dry-run",
        "--post-as",
        "editorbridgeforum",
        "--discourse-url",
        "https://forum.example.com",
        "--site-url",
        "https://docs.example.com",
      ],
      {
        cwd: path.resolve("."),
        env: {
          ...process.env,
          DISCOURSE_POST_AS: "",
          DISCOURSE_API_USERNAME: "",
        },
      },
    );

    assert.match(stdout, /^Post as: editorbridgeforum$/m);
    assert.match(stdout, /dry-run-create:/);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});
