import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { staticFixture } from "./cms-static.mjs";
import { lease, html } from "./cms-coordinator.mjs";
import { semanticIdentity } from "../../src/private/cms-runtime.mjs";
import { claimCmsNativeWork, pollCmsSources, reserveCmsSource } from "../../dist/cms-coordinator.js";
import { prepareCmsNativeWork } from "../../dist/cms-static.js";

/** Actual native writer and typed simulated receiver with persistent mutation
 * receipts. No timers/clock shortcuts, live credentials or external transport. */
export async function resumeFixture(t, { initialClaim = true } = {}) {
  const base = await staticFixture(t, {}, html, "full", false), options = base.options, original = options.fetchImplementation;
  base.nativeWork.state = "pending"; base.nativeWork.attempt = 0; base.nativeWork.lease_generation = 0;
  let expires = null, token, loss, faultRenewal, faultPreparation, queryFaultAfterClaim = false;
  const receipts = new Map(), requests = [], effects = { claim: 0, renew: 0, prepare: 0 };
  const http = { claim: 0, renew: 0, prepare: 0, query: 0 };
  const response = (body, status = 200) => body === undefined ? new Response(null, { status }) : Response.json(structuredClone(body), { status });
  const rejected = code => response({ outcome: "rejected", code, retryable: false, retry_after_seconds: null, correlation_id: null, core_fallback: false }, 409);
  const currentLease = () => ({ ...lease, work: structuredClone(base.nativeWork), lease_token: token, lease_generation: base.nativeWork.lease_generation,
    expires_at: expires, server_time: new Date().toISOString() });
  options.fetchImplementation = async (value, init) => {
    const url = new URL(value); assert.equal(url.origin, "https://forum.example"); assert.equal(init.redirect, "error");
    const kind = url.pathname.endsWith("claim.json") ? "claim" : url.pathname.endsWith("renew.json") ? "renew"
      : /\/work\/[^/]+\/prepare\.json$/u.test(url.pathname) ? "prepare" : undefined;
    if (!kind) {
      if (/\/work\/[^/]+\.json$/u.test(url.pathname)) {
        http.query++;
        if (queryFaultAfterClaim && effects.claim > 1) { queryFaultAfterClaim = false; throw new Error("Synthetic restart after durably saved fresh Claim."); }
        const result = await original(value, init), body = await result.json(); body.lease_expires_at = expires; return response(body, result.status);
      }
      return original(value, init);
    }
    http[kind]++; const body = JSON.parse(init.body), key = `${url.pathname}:${body.mutation_id}`;
    requests.push({ kind, body: structuredClone(body) });
    const old = receipts.get(key);
    if (old) { assert.equal(semanticIdentity(old.body), semanticIdentity(body)); return response(old.result, old.status); }
    if (kind === "renew" && faultRenewal) { const fault = faultRenewal; faultRenewal = undefined; return fault(body, currentLease()); }
    if (kind === "prepare" && faultPreparation) { const fault = faultPreparation; faultPreparation = undefined; return fault(body); }
    if (loss?.kind === kind && loss.before) { loss = undefined; throw new Error("Synthetic mutation did not reach receiver."); }
    let result, status = 200;
    if (kind === "claim") {
      if (base.nativeWork.state !== "pending" || body.mapping_id !== undefined && body.mapping_id !== base.nativeMapping.mapping_id) { result = undefined; status = 204; }
      else {
        effects.claim++; base.nativeWork.state = "leased"; base.nativeWork.lease_generation++; base.nativeWork.attempt++;
        token = Buffer.alloc(32, base.nativeWork.lease_generation + 6).toString("base64url"); expires = new Date(Date.now() + 300000).toISOString(); result = currentLease();
      }
    } else {
      const authority = body.authority;
      if (!expires || Date.parse(expires) <= Date.now()) return rejected("lease_expired");
      if (authority.lease_generation !== base.nativeWork.lease_generation || authority.lease_token !== token) return rejected("lease_conflict");
      if (kind === "renew") {
        effects.renew++; expires = new Date(Date.now() + 300000).toISOString(); result = currentLease();
      } else {
        if (base.nativeWork.state !== "leased") return rejected("invalid_transition");
        effects.prepare++; const accepted = await original(value, init); result = await accepted.json(); result.lease_expires_at = expires;
      }
    }
    receipts.set(key, { body: structuredClone(body), result: structuredClone(result), status });
    if (loss?.kind === kind) { loss = undefined; throw new Error("Synthetic accepted mutation response was lost."); }
    return response(result, status);
  };
  await pollCmsSources(options); await reserveCmsSource(options, base.sourceRecord.source_id);
  const claimed = initialClaim ? await claimCmsNativeWork(options) : undefined; if (initialClaim) assert.ok(claimed);
  const workId = claimed?.workId ?? base.nativeWork.work_id;
  return { base, options, workId, requests, receipts, effects, http,
    journal: async () => JSON.parse(await readFile(options.stateFile, "utf8")),
    prepare: () => prepareCmsNativeWork(options, workId),
    expire() { expires = null; base.nativeWork.state = "pending"; base.nativeWork.last_failure_code = "transport_timeout"; },
    loseNext(kind, before = false) { loss = { kind, before }; },
    failRenewalOnce(action) { faultRenewal = action; },
    failPreparationOnce(action) { faultPreparation = action; },
    restartAfterClaim() { queryFaultAfterClaim = true; },
    foreignLease() { base.nativeWork.lease_generation++; base.nativeWork.attempt++; base.nativeWork.state = "leased"; token = Buffer.alloc(32, 50).toString("base64url"); expires = new Date(Date.now() + 300000).toISOString(); },
  };
}
