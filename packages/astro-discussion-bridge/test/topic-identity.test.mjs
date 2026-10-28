import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTopicId, parsePublicTopicJson } from "../dist/topic-identity.js";

test("topic identities preserve exact strings and reject already-rounded numeric arguments", () => {
  for (const id of ["1", "53", "9007199254740991", "9007199254740992", "9007199254740993", "9223372036854775807"]) assert.equal(normalizeTopicId(id), id);
  assert.equal(normalizeTopicId(53), "53"); assert.equal(normalizeTopicId(Number.MAX_SAFE_INTEGER), "9007199254740991");
  assert.equal(normalizeTopicId(undefined), undefined);
  for (const id of [null, true, {}, [], 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, Number("9007199254740993"), "0", "01", "-1", "1.0", "1e2", " 53", "53\n", "9223372036854775808"]) assert.throws(() => normalizeTopicId(id));
});

test("public JSON preserves numeric topic IDs before parsing without changing strings or non-ID numbers", () => {
  const original = String.raw`{"post_stream":{"posts":[{"topic_id":9007199254740993},{"topic_id":9223372036854775807},{"topic_id":"9007199254740992"},{"topic\u005fid":53},{"topic_id":"900719925474099\u0033"}]},"content":"escaped \\\"topic_id\\\":9223372036854775807 \\ and 雪","nested":{"text":"topic_id","count":9007199254740993,"fraction":1.25,"exponent":1e3,"negative":-27}}`;
  const value = parsePublicTopicJson(original);
  assert.deepEqual(value.post_stream.posts.map(post => post.topic_id), ["9007199254740993", "9223372036854775807", "9007199254740992", "53", "9007199254740993"]);
  assert.equal(value.content, JSON.parse(original).content);
  assert.deepEqual(value.nested, JSON.parse(original).nested);
  assert.equal(parsePublicTopicJson('{"topic_id":53}').topic_id, "53");
  assert.equal(parsePublicTopicJson('{"topic_id":42.0}').topic_id, "42");
  assert.equal(parsePublicTopicJson('{"topic_id":1e3}').topic_id, "1000");
});

test("public JSON rejects malformed/out-of-range topic IDs and malformed JSON", () => {
  for (const id of ["0", "-1", "1.5", "9.007199254740993e15", "9223372036854775808", "null", "true", '"01"', '"53\\n"', "[]", "{}"])
    assert.throws(() => parsePublicTopicJson(`{"topic_id":${id}}`));
  for (const body of ['{"topic_id":01}', '{"topic_id":53.}', '{"topic_id":53e+}', '{"topic_id":53,"text":"bad\\q"}', '{"topic_id":53', '{"topic_id":53} trailing']) assert.throws(() => parsePublicTopicJson(body));
});
