import assert from "node:assert/strict";
import test from "node:test";

import {
  OBSERVED_USLM_ELEMENTS,
  USLM_ATTRIBUTE_REGISTRY,
  USLM_ELEMENT_REGISTRY,
  USLM_RENDERER_PROFILE,
  validateUslmAttributeCensus,
  validateUslmRendererCensus,
} from "../obbba-law-uslm-renderer-registry.mjs";

test("frozen renderer registry exactly covers the reviewed 40-element census", () => {
  assert.equal(USLM_RENDERER_PROFILE, "obbba-uslm-markdown-v1");
  assert.equal(OBSERVED_USLM_ELEMENTS.length, 40);
  assert.equal(Object.keys(USLM_ELEMENT_REGISTRY).length, 40);
  assert.equal(validateUslmRendererCensus([...OBSERVED_USLM_ELEMENTS]), true);
  assert.equal(USLM_ELEMENT_REGISTRY.continuation, "operative-flow");
  assert.equal(USLM_ELEMENT_REGISTRY.signature, "operative-signature");
  assert.equal(USLM_ELEMENT_REGISTRY.table, "table");
  assert.equal(USLM_ELEMENT_REGISTRY.notes, "editorial-boundary");
  assert.equal(USLM_ELEMENT_REGISTRY.sourceCredit, "editorial-boundary");
  assert.equal(validateUslmAttributeCensus(USLM_ATTRIBUTE_REGISTRY), true);
});

test("census fails closed on missing, unknown, or duplicate elements", () => {
  assert.throws(
    () => validateUslmRendererCensus(
      OBSERVED_USLM_ELEMENTS.filter((name) => name !== "continuation"),
    ),
    /census drift/,
  );
  assert.throws(
    () => validateUslmRendererCensus([...OBSERVED_USLM_ELEMENTS, "formula"]),
    /unknown=formula/,
  );
  assert.throws(
    () => validateUslmRendererCensus([...OBSERVED_USLM_ELEMENTS, "table"]),
    /census is invalid/,
  );
});

test("attribute registry fails closed on unknown, missing, or duplicate names", () => {
  const copy = () => Object.fromEntries(
    Object.entries(USLM_ATTRIBUTE_REGISTRY)
      .map(([element, attributes]) => [element, [...attributes]]),
  );
  const unknown = copy();
  unknown.ref.push("onclick");
  assert.throws(
    () => validateUslmAttributeCensus(unknown),
    /unknown=onclick/,
  );
  const missing = copy();
  missing.section = missing.section.filter((name) => name !== "identifier");
  assert.throws(
    () => validateUslmAttributeCensus(missing),
    /missing=identifier/,
  );
  const duplicate = copy();
  duplicate.table.push("style");
  assert.throws(
    () => validateUslmAttributeCensus(duplicate),
    /attribute census is invalid/,
  );
});
