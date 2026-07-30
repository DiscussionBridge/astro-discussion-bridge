import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import * as pageRenderer
  from "../obbba-law-as-amended-page-renderer.mjs";

const rendererSource = readFileSync(
  new URL("../obbba-law-as-amended-page-renderer.mjs", import.meta.url),
  "utf8",
);

test("exposes only the bounded official-law renderer", () => {
  assert.equal(typeof pageRenderer.renderOfficialLawPage, "function");
  assert.equal(pageRenderer.renderEnactedOnlyLawPage, undefined);
});

test("fails closed until the prior-state label contract is approved", () => {
  assert.throws(
    () => pageRenderer.renderOfficialLawPage({}, []),
    {
      message: "Law page prior-state label contract is not approved.",
    },
  );
});

test("does not encode a generic prior-state label", () => {
  assert.doesNotMatch(rendererSource, /Before OBBBA|before-OBBBA/);
});
