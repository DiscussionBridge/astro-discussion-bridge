import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDiscourseTopicReference,
  parseServiceBaseUrl,
  resolveServiceRequestUrl,
  serviceRelativeRequestTarget,
} from "../dist/web-url.js";

test("service URL resolution preserves root and Discourse subfolder boundaries", () => {
  const root = parseServiceBaseUrl("https://forum.example.com");
  const subfolder = parseServiceBaseUrl("https://forum.example.com/community");

  assert.equal(resolveServiceRequestUrl("/t/21.json", root).href, "https://forum.example.com/t/21.json");
  assert.equal(
    resolveServiceRequestUrl("/t/21.json?include_raw=1", subfolder).href,
    "https://forum.example.com/community/t/21.json?include_raw=1",
  );
  assert.equal(
    serviceRelativeRequestTarget("https://forum.example.com/community/t/slug/21/4", subfolder),
    "t/slug/21/4",
  );
  assert.equal(
    serviceRelativeRequestTarget("/community/c/news/2.json?page=3", subfolder),
    "c/news/2.json?page=3",
  );
});

test("service URL resolution rejects authority and path escapes", () => {
  for (const value of [
    "https://forum.example.com/community/../outside",
    "https://forum.example.com/community/%252e%252e/outside",
    "https:\\forum.example.com\\community",
  ]) {
    assert.throws(() => parseServiceBaseUrl(value), /ambiguous or escaping/);
  }
  const base = parseServiceBaseUrl("https://forum.example.com/community");
  for (const value of [
    "https://attacker.invalid/community/t/21",
    "https://forum.example.com/outside/t/21",
    "//attacker.invalid/capture",
    "/community/t/21#fragment",
    "/community/t/%2e%2e/outside",
    "/community/t/%252e%252e/outside",
    "/community/t%2foutside",
    "/community\\t\\21",
  ]) {
    assert.throws(() => serviceRelativeRequestTarget(value, base));
  }
  assert.throws(() => resolveServiceRequestUrl("../outside", base), /ambiguous or escaping/);
  assert.throws(() => resolveServiceRequestUrl("topic#fragment", base), /must not contain a fragment/);
});

test("topic references distinguish slugless post routes within the exact service boundary", () => {
  const base = parseServiceBaseUrl("https://forum.example.com/community");
  assert.deepEqual(parseDiscourseTopicReference("https://forum.example.com/community/t/123", base), {
    topicId: 123,
  });
  assert.deepEqual(parseDiscourseTopicReference("https://forum.example.com/community/t/123/4", base), {
    topicId: 123,
    postNumber: 4,
  });
  assert.deepEqual(parseDiscourseTopicReference("t/topic-slug/123/4", base), {
    topicId: 123,
    slug: "topic-slug",
    postNumber: 4,
  });
  assert.throws(
    () => parseDiscourseTopicReference("https://forum.example.com/outside/t/123", base),
    /left the configured Discourse origin or path boundary/,
  );
  assert.throws(() => parseDiscourseTopicReference("t/topic/123/4/5", base), /unsupported route shape/);
  assert.throws(
    () => parseDiscourseTopicReference("t/9007199254740993", base),
    /unsupported route shape/,
  );
});
