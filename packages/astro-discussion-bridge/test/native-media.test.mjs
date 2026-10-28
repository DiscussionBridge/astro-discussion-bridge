import assert from "node:assert/strict";
import test from "node:test";
import { assertNativeMediaPreservedByCurrentRenderer, NativeMediaUnsupportedError } from "../dist/native-media.js";

test("known native loss preflight inspects actual media elements without classifying comments or examples", () => {
  for (const tag of ["video", "audio", "source", "track", "iframe", "object", "embed"]) assert.throws(() => assertNativeMediaPreservedByCurrentRenderer(`<${tag} data-consumer-owned="yes"></${tag}>`), NativeMediaUnsupportedError);
  for (const source of ['<!-- <video src="example.mp4"> -->', '<pre><code>&lt;video controls&gt;literal example&lt;/video&gt;</code></pre>', '<p>Underlying <a href="https://media.example/video.mp4">video link</a></p>', '<figure><figcaption>Native caption</figcaption></figure>']) assert.doesNotThrow(() => assertNativeMediaPreservedByCurrentRenderer(source));
});

test("specific known script/function/data loss is reported without converting data to executable function", () => {
  assert.throws(() => assertNativeMediaPreservedByCurrentRenderer('<script type="application/json">{"native":"data"}</script>'), /article DATA \(application\/json\)/);
  assert.throws(() => assertNativeMediaPreservedByCurrentRenderer('<script>nativeInteractiveFunction()</script>'), /script FUNCTION/);
  assert.throws(() => assertNativeMediaPreservedByCurrentRenderer('<p onclick="nativeInteraction()">Native control</p>'), /onclick handler FUNCTION/);
  for (const source of ['<!-- <script>example()</script> -->', '<pre><code>&lt;script&gt;displayed()&lt;/script&gt;</code></pre>', '<script type="application/json"></script>']) assert.doesNotThrow(() => assertNativeMediaPreservedByCurrentRenderer(source));
});
