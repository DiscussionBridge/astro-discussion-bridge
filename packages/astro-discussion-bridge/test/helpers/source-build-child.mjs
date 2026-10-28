import { readFile, writeFile } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import path from "node:path";
const config = JSON.parse(await readFile(process.argv[2], "utf8"));
for (const [stream, name] of [[process.stdout, "child-native-stdout.txt"], [process.stderr, "child-native-stderr.txt"]]) {
  const file = path.join(config.root, name); await writeFile(file, "");
  stream.write = (chunk, encoding, callback) => { appendFileSync(file, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === "string" ? encoding : "utf8")); (typeof encoding === "function" ? encoding : callback)?.(); return true; };
}
config.options.controlledCreation.fetchImplementation = async (url, init) => {
  const response = await fetch(`${config.receiverOrigin}${new URL(url).pathname}`, init);
  return new Response(response.body, { status: response.status, headers: response.headers });
};
try {
  const { buildToConsumer } = await import("../fixtures/native-to-consumer.mjs");
  if (config.holdNativeWriterMs) {
    const { withNativeSourceWriter } = await import("../../dist/native-locks.js");
    config.beforeCapture = () => withNativeSourceWriter(config.options.docsDir, config.options.stateFile, () => new Promise(resolve => setTimeout(resolve, config.holdNativeWriterMs)));
  }
  await buildToConsumer(config, undefined, true, true);
  const count = path.join(config.root, "child-build-count.txt"); let value = 0; try { value = Number(await readFile(count, "utf8")); } catch {}
  await writeFile(count, String(value + 1));
} catch (error) { await writeFile(path.join(config.root, "child-native-error.json"), JSON.stringify({ name: error.name, message: error.message, stack: error.stack }, null, 2)); process.exitCode = 1; }
