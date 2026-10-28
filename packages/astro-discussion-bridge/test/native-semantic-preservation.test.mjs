import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { captureNativeArticle, NativePreparationLimitation } from "../dist/native-preparation.js";
import { prepareNativeRenderedArticle } from "../dist/native-source.js";
import { nativePublicationFiles } from "../dist/native-publication.js";
import { publishControlledDiscussions } from "../dist/controlled-creation.js";
import { nativeSource, toFixture } from "./fixtures/cms-to.mjs";
import { staticFixture } from "./fixtures/cms-static.mjs";
import * as nativeMedia from "../dist/native-media.js";

const base = "https://content.example/articles/original/";
const prepare = {
  To: html => prepareNativeRenderedArticle(captureNativeArticle(html, base, "markdown"), html),
  From: html => nativePublicationFiles.sanitize(html, base),
};
const destructive = [
  ["native form controls", '<form action="https://content.example/search"><label>Search<input name="q"></label><button type="submit">Find</button></form><p>Article remains.</p>', /form|control/i],
  ["ordered list start", '<ol start="7"><li>Seventh</li><li>Eighth</li></ol>', /number|start/i, /<ol start="7">/u],
  ["ordered list reversed", '<ol reversed><li>Second</li><li>First</li></ol>', /number|reversed/i, /<ol reversed(?:="")?>/u],
  ["list item number", '<ol><li value="12">Twelfth</li></ol>', /number|value/i, /<li value="12">/u],
  ["CSS generated content", '<style>.notice::before { content: "Required warning: "; }</style><p class="notice">Article.</p>', /style|CSS/i],
  ["inline style meaning", '<p style="white-space: pre">Column one    Column two</p>', /style|CSS/i],
  ["native SVG drawing", '<svg viewBox="0 0 10 10"><title>Native diagram</title><path d="M0 0L10 10" /></svg><p>Diagram explanation.</p>', /svg|drawing/i],
  ["native canvas", '<canvas width="640" height="480">Fallback diagram text</canvas><p>Article.</p>', /canvas|drawing/i],
];

for (const [direction, run] of Object.entries(prepare)) {
  for (const [name, original, message, retained] of destructive) {
    test(`${direction} retains ${name} or reports its specific loss before completing prepared evidence`, () => {
      if (retained) {
        const capture = run(original);
        assert.match(capture.preparedHtml, retained);
        assert.equal(capture.original, original);
        return;
      }
      assert.throws(() => run(original), error => {
        assert.ok(error instanceof NativePreparationLimitation);
        assert.match(error.message, message);
        assert.equal(error.capture.original, original);
        assert.equal(error.capture.sourceArticleUrl, base);
        assert.equal(error.capture.preparedHtml, undefined);
        assert.equal(error.capture.preparedSha256, undefined);
        return true;
      });
    });
  }

  test(`${direction} preserves ordinary content, captured references, displayed code and math`, () => {
    const original = '<p>Plain article x² + y².</p><img src="../image.png" alt="Diagram"><ol><li>First</li><li>Second</li></ol>'
      + '<pre><code class="language-math">x^2 + y^2</code></pre><pre><code>&lt;form&gt;&lt;svg&gt;&lt;style&gt;.x::before&lt;/style&gt;</code></pre>'
      + '<!-- <canvas></canvas> -->';
    const capture = run(original);
    assert.equal(capture.original, original);
    assert.match(capture.preparedHtml, /Plain article x² \+ y²/u);
    assert.match(capture.preparedHtml, /src="https:\/\/content.example\/articles\/image.png"/u);
    assert.match(capture.preparedHtml, /<ol><li>First<\/li><li>Second<\/li><\/ol>/u);
    assert.match(capture.preparedHtml, /class="language-math">x\^2 \+ y\^2/u);
    assert.match(capture.preparedHtml, /&lt;form&gt;&lt;svg&gt;&lt;style&gt;/u);
    assert.equal(capture.preparedBytes, Buffer.byteLength(capture.preparedHtml));
  });

  test(`${direction} retains the existing specific handler limitation`, () => {
    assert.throws(() => run('<p onpointerdown="choose()">Choose</p>'), /onpointerdown handler FUNCTION/u);
  });

  test(`${direction} retains native numbering type and table cell meaning without an execution recipe`, () => {
    const capture = run('<ol start="4" type="A"><li value="6">Six</li></ol><table><tr><th id="group" colspan="2" scope="col">Group</th></tr><tr><td id="value" rowspan="2" headers="group">Value</td></tr></table>');
    assert.match(capture.preparedHtml, /<ol start="4" type="A">/u);
    assert.match(capture.preparedHtml, /<li value="6">/u);
    assert.match(capture.preparedHtml, /<th id="group" colspan="2" scope="col">/u);
    assert.match(capture.preparedHtml, /<td id="value" rowspan="2" headers="group">/u);
  });

  test(`${direction} does not extend known code-decoration normalization to content/layout styles`, () => {
    assert.throws(() => run('<pre class="astro-code" data-language="math" style="white-space: pre-wrap"><code class="language-math">x^2</code></pre>'), /inline CSS\/style/u);
  });
}

test("actual To caller retains refused native source before receiver dispatch", async t => {
  const original = destructive[0][1];
  const state = await toFixture(t, nativeSource(original), "53");
  await assert.rejects(publishControlledDiscussions(state.options), NativePreparationLimitation);
  const journal = await state.journal(), limitation = Object.values(journal.preparationLimitations)[0];
  assert.equal(limitation.capture.original, original + "\n");
  assert.equal(limitation.capture.preparedSha256, undefined);
  assert.equal(state.received.length, 0);
  assert.equal((await readFile(state.file, "utf8")).split("---\n").at(-1), original + "\n");
});

test("actual From caller keeps original and local limitation without staging/failure", async t => {
  const original = destructive[4][1];
  const state = await staticFixture(t, {}, original);
  await assert.rejects(state.prepare(), NativePreparationLimitation);
  const journal = JSON.parse(await readFile(state.options.stateFile, "utf8"));
  const transaction = journal.transactions[state.claimed.workId];
  assert.equal(transaction.articleCapture.original, original);
  assert.equal(transaction.articleCapture.preparedSha256, undefined);
  assert.equal(transaction.localLimitation.kind, "native_preparation");
  assert.equal(transaction.plan, undefined);
  assert.equal(state.prepared.length, 0);
  assert.equal(state.failures.length, 0);
});

test("meaning observer permits faithfully retained native structures instead of banning source classes", () => {
  for (const [, original] of destructive) assert.doesNotThrow(() => nativeMedia.assertNativeMeaningRetained(original, original));
  assert.throws(() => nativeMedia.assertNativeMeaningRetained('<ol start="7"><li>Step</li></ol>', '<ol start="8"><li>Step</li></ol>'), /list numbering/u);
  assert.throws(() => nativeMedia.assertNativeMeaningRetained('<canvas>A</canvas><canvas>A</canvas>', '<canvas>A</canvas>'), /canvas/u);
  assert.throws(() => nativeMedia.assertNativeMeaningRetained('<pre class="astro-code" data-language="math" style="color:#fff"><code>x^2</code></pre>', '<pre class="astro-code"><code>x^2</code></pre>'), /inline CSS\/style/u,
    "a code-looking marker does not establish the existing verified native-code recipe");
});
