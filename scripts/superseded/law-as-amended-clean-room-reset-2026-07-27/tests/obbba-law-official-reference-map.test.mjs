import assert from "node:assert/strict";
import test from "node:test";

import {
  mapOfficialReference,
  OFFICIAL_REFERENCE_MAP_PROFILE,
} from "../obbba-law-official-reference-map.mjs";

test("maps current USC references to the documented OLRC prelim form", () => {
  const result = mapOfficialReference("/us/usc/t7/s9081/b/2", {
    releaseRole: "current",
  });
  assert.equal(result.profile, OFFICIAL_REFERENCE_MAP_PROFILE);
  assert.equal(result.originalHref, "/us/usc/t7/s9081/b/2");
  assert.equal(result.resolution, "verified-official-link");
  assert.equal(
    result.mappedUrl,
    "https://uscode.house.gov/view.xhtml?"
      + "req=granuleid%3AUSC-prelim-title7-section9081&num=0&edition=prelim"
      + "#substructure-location_b_2",
  );
});

test("maps only reviewed USC section identities and enumerator fragments", () => {
  assert.match(
    mapOfficialReference("/us/usc/t26/s1402/a/1/A/i", {
      releaseRole: "current",
    }).mappedUrl,
    /#substructure-location_a_1_A_i$/,
  );
  for (const href of [
    "/us/usc/t26/s..",
    "/us/usc/t26/s-1402",
    "/us/usc/t26/s1402-",
    "/us/usc/t26/s.1402",
    "/us/usc/t26/s1402.",
    "/us/usc/t26/s1402..a",
    "/us/usc/t26/s1402--a",
    "/us/usc/t26/s1402.-a",
    "/us/usc/t26/s1402–-a",
  ]) {
    const result = mapOfficialReference(href, { releaseRole: "current" });
    assert.equal(result.resolution, "preserved-non-clickable");
    assert.equal(result.reason, "usc-path-is-not-a-section-reference");
  }
  const bounded = mapOfficialReference("/us/usc/t26/s1402/a:b", {
    releaseRole: "current",
  });
  assert.equal(bounded.resolution, "verified-official-link");
  assert.equal(bounded.fragmentResolution, "omitted-unreviewed-substructure");
  assert.doesNotMatch(bounded.mappedUrl, /#/);
});

test("does not misrepresent prior USC or legacy act references", () => {
  for (const [href, reason] of [
    ["/us/usc/t7/s9081", "prior-release-section-url-not-reviewed"],
    ["/us/act/1935-08-14", "no-reviewed-official-act-resolver"],
  ]) {
    const result = mapOfficialReference(href, { releaseRole: "before" });
    assert.equal(result.resolution, "preserved-non-clickable");
    assert.equal(result.reason, reason);
    assert.equal(result.mappedUrl, undefined);
    assert.equal(result.originalHref, href);
  }
});

test("maps immutable public-law and statute authorities to GovInfo", () => {
  assert.equal(
    mapOfficialReference("/us/pl/119/21/tI/s10401", {
      releaseRole: "before",
    }).mappedUrl,
    "https://www.govinfo.gov/app/details/PLAW-119publ21",
  );
  assert.equal(
    mapOfficialReference("/us/stat/139/101-103", {
      releaseRole: "current",
    }).mappedUrl,
    "https://www.govinfo.gov/app/details/STATUTE-139",
  );
  for (const href of [
    "/us/stat/139/foo",
    "/us/stat/139/-101",
    "/us/stat/139/101-",
    "/us/stat/139/101--103",
    "/us/stat/139/103-101",
  ]) {
    const result = mapOfficialReference(href, { releaseRole: "current" });
    assert.equal(result.resolution, "preserved-non-clickable");
    assert.equal(result.reason,
      "statutes-at-large-citation-is-not-canonical");
  }
});

test("rejects paths outside the frozen AST reference grammar", () => {
  for (const href of [
    "/us/evil/x",
    "/us/usc/t7//s1",
    "/us/usc/t7/../s1",
    "/us/usc/title 7",
    "/us/usc/%2e%2e/s1",
    "/us/usc/t7/s1?x",
    "/us/usc/t7/s1#x",
    "/us/usc/t7\\s1",
  ]) {
    assert.throws(
      () => mapOfficialReference(href, { releaseRole: "current" }),
      /outside the reviewed grammar/,
    );
  }
});
