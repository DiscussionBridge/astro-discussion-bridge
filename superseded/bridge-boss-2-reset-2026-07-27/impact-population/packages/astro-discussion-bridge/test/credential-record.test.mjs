import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  readDiscourseApiKeyRecord,
  resolveDiscourseApiKey,
} from "../dist/credential-record.js";

const canary = "0123456789abcdef".repeat(4);

test("protected record returns exactly one unformatted Discourse key line", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bridge-key-record-"));
  const record = path.join(directory, "diagnostics.txt");
  await writeFile(record, `Actor: obbba-bot\nScope: read\n${canary}\n`, "utf8");
  assert.equal(await readDiscourseApiKeyRecord(record), canary);
});

test("protected record rejects formatted, multiple, empty, and unreadable values without disclosure", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bridge-key-record-"));
  const cases = [
    `Actor: obbba-bot\n${canary.slice(0, 32)} ${canary.slice(32)}\n`,
    `${canary}\n${"a".repeat(64)}\n`,
    "Actor: obbba-bot\nScope: read\n",
  ];
  for (const [index, value] of cases.entries()) {
    const record = path.join(directory, `${index}.txt`);
    await writeFile(record, value, "utf8");
    await assert.rejects(
      readDiscourseApiKeyRecord(record),
      (error) => {
        assert.match(error.message, /exactly one unformatted 64-character key line/);
        assert.doesNotMatch(error.message, new RegExp(canary));
        return true;
      },
    );
  }
  await assert.rejects(
    readDiscourseApiKeyRecord(path.join(directory, "missing.txt")),
    (error) => {
      assert.equal(error.message, "The protected Discourse API key record could not be read.");
      assert.doesNotMatch(error.message, /missing\.txt/);
      return true;
    },
  );
});

test("explicit credential selection wins over inherited environment state", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bridge-key-record-"));
  const record = path.join(directory, "diagnostics.txt");
  const inheritedCanary = "a".repeat(64);
  await writeFile(record, `${canary}\n`, "utf8");

  assert.equal(
    await resolveDiscourseApiKey({
      optionFile: record,
      environmentKey: inheritedCanary,
    }),
    canary,
  );
  assert.equal(
    await resolveDiscourseApiKey({
      optionKey: canary,
      environmentFile: record,
    }),
    canary,
  );
});

test("credential selection fails closed for same-level ambiguity", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bridge-key-record-"));
  const record = path.join(directory, "diagnostics.txt");
  const secondCanary = "a".repeat(64);
  await writeFile(record, `${canary}\n`, "utf8");

  await assert.rejects(
    resolveDiscourseApiKey({ optionKey: canary, optionFile: record }),
    /only one explicit diagnostics credential source/,
  );
  await assert.rejects(
    resolveDiscourseApiKey({
      environmentKey: canary,
      environmentFile: record,
    }),
    /only one diagnostics credential environment source/,
  );
  assert.equal(
    await resolveDiscourseApiKey({
      optionFile: record,
      environmentKey: secondCanary,
    }),
    canary,
  );
});

test("literal credential sources reject empty and malformed values without repair", async () => {
  assert.equal(
    await resolveDiscourseApiKey({
      optionKey: "",
      environmentKey: canary,
    }),
    canary,
  );
  for (const malformed of [
    ` ${canary}`,
    `${canary} `,
    `${canary.slice(0, 32)} ${canary.slice(32)}`,
    canary.slice(1),
  ]) {
    await assert.rejects(
      resolveDiscourseApiKey({ environmentKey: malformed }),
      (error) => {
        assert.match(error.message, /one unformatted 64-character value/);
        assert.doesNotMatch(error.message, new RegExp(canary));
        return true;
      },
    );
  }
});
