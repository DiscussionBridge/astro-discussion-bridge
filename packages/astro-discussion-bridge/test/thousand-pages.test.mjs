import assert from "node:assert/strict";
import test from "node:test";
import { verifyThousandPages } from "../scripts/verify-thousand-pages.mjs";

test("shipped corpus verifier exercises real author state and labels synthetic/public evidence separately", async () => {
  const result = await verifyThousandPages({ count: 4 });
  assert.equal(result.count, 4);
  assert.equal(result.census.created, 4);
  assert.equal(result.receiverWrites, 6);
  assert.equal(result.receipts.length, 4);
  assert.equal(result.operationalState.operations, 4);
  assert.equal(result.publicVerification.verified, false);
  assert.equal(result.qualification, "synthetic-local-author-pipeline");
  assert.ok(result.sourceIdentity.some(member => member.path === "scripts/verify-thousand-pages.mjs"));
});
