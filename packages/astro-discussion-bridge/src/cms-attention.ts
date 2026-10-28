import { randomUUID } from "node:crypto";
import { CmsClient, CmsRequestError, type CmsLease } from "./cms-client.js";
import { emptyCmsState, readCmsState, stageCmsClaim, writeCmsState } from "./cms-state.js";
import { withNativeSourceWriter } from "./native-locks.js";
import { collectCmsAttentionNative, type CmsAttentionOptions } from "./cms-attention-native.js";
import { readAttentionState, writeAttentionState } from "./cms-attention-state.js";
import { semanticIdentity, validateCms } from "../src/private/cms-runtime.mjs";
import type { AttentionInspection, AttentionObservation, AttentionRecovery, AttentionResult, AttentionState } from "./cms-attention-types.js";
const same = (left: unknown, right: unknown) => semanticIdentity(left) === semanticIdentity(right);
type Page<T> = { items: T[]; next_after: number; has_more: boolean };

async function supports(client: CmsClient): Promise<boolean> {
  try {
    const value = await client.request<{ protocol_revision: string; inspection_profiles: string[] }>("V4-32");
    return value.protocol_revision === "attention-recovery-1" && value.inspection_profiles.includes("astro-static-1");
  } catch (error) {
    if (error instanceof CmsRequestError && ["unsupported_behavior", "resource_not_found"].includes(error.code)) return false;
    throw error;
  }
}
function pageOrder<T extends { sequence: number }>(page: Page<T>, after: number, known: (item: T) => T | undefined) {
  let sequence = after;
  for (const item of page.items) {
    const prior = known(item);
    if (prior && !same(prior, item) || !prior && item.sequence <= after || item.sequence <= sequence) throw new Error("Attention continuation changed or reversed its durable identity.");
    sequence = item.sequence;
  }
  if (page.next_after !== sequence || page.has_more && page.next_after <= after || !page.items.length && page.next_after !== after) throw new Error("Attention continuation cannot skip or repeat unstaged instructions.");
}
async function reportSaved(options: CmsAttentionOptions, client: CmsClient, state: Awaited<ReturnType<typeof readCmsState>>, recovery: AttentionState) {
  let reported = 0;
  for (const saved of Object.values(recovery.inspections)) {
    if (Object.values(recovery.recoveries).some(value => value.event.inspection_id === saved.instruction.inspection_id)) continue;
    // Every Core inspection accepts one immutable factual observation. An
    // explicit later Core Check issues a new instruction, even for that context.
    if (saved.result) continue;
    // A lost report response reuses the persisted exact body and mutation ID.
    // A later Check after an accepted result obtains a new actual observation.
    if (!saved.report || saved.result) {
      saved.observation = await collectCmsAttentionNative(options, saved.instruction, state, client, recovery);
      saved.report = { mutation_id: randomUUID(), context_sha256: saved.instruction.context_sha256, observation: saved.observation };
      delete saved.result; await writeAttentionState(options, recovery);
    }
    const result = await client.request<AttentionResult>("V4-34", { path: { inspection_id: saved.instruction.inspection_id }, body: saved.report });
    if (result.inspection_id !== saved.instruction.inspection_id || result.context_sha256 !== saved.instruction.context_sha256) throw new Error("Attention report response changed its immutable context.");
    saved.result = result; await writeAttentionState(options, recovery); reported++;
  }
  return reported;
}
/** Read actual native state and report facts; never stages, restores or runs a command. */
export async function checkCmsAttention(options: CmsAttentionOptions) {
  return withNativeSourceWriter(options.docsDir, options.stateFile, async () => {
    const client = new CmsClient(options);
    if (!await supports(client)) return { supported: false, reported: 0, inspections: [] };
    const state = await readCmsState(options.stateFile, emptyCmsState(client, options.siteUrl, options.connectionId)), recovery = await readAttentionState(options);
    let reported = 0;
    // Retry an uncertain report before requesting further feed instructions.
    for (const saved of Object.values(recovery.inspections).filter(item => item.report && !item.result)) {
      const result = await client.request<AttentionResult>("V4-34", { path: { inspection_id: saved.instruction.inspection_id }, body: saved.report });
      if (result.inspection_id !== saved.instruction.inspection_id || result.context_sha256 !== saved.instruction.context_sha256) throw new Error("Attention report response changed its immutable context.");
      saved.result = result; await writeAttentionState(options, recovery);
    }
    for (let count = 0; ; count++) {
      if (count >= 128) throw new Error("Attention instruction feed did not terminate within its local page bound.");
      const page = await client.request<Page<AttentionInspection>>("V4-33", { query: { after: recovery.inspectionsAfter } });
      pageOrder(page, recovery.inspectionsAfter, item => recovery.inspections[item.inspection_id]?.instruction);
      for (const instruction of page.items) {
        recovery.inspections[instruction.inspection_id] ??= { instruction };
        await writeAttentionState(options, recovery);
      }
      recovery.inspectionsAfter = page.next_after; await writeAttentionState(options, recovery);
      if (!page.has_more) break;
    }
    reported += await reportSaved(options, client, state, recovery);
    return { supported: true, reported, inspections: Object.values(recovery.inspections).map(value => ({ inspectionId: value.instruction.inspection_id,
      workId: value.instruction.work.work_id, contextSha256: value.instruction.context_sha256, journalSha256: value.observation?.journal_sha256 ?? null,
      nativeState: value.observation?.native_state ?? null, status: value.result?.status ?? "waiting", issue: value.result?.issue ?? value.observation?.issue ?? "collector_unavailable" })) };
  });
}
function assertSuccessor(event: AttentionRecovery, lease: CmsLease) {
  const expected = event.work, actual = lease.work;
  if (expected.work_id === event.predecessor_work_id || expected.attempt_cycle === event.predecessor_attempt_cycle || expected.state !== "pending" || expected.attempt !== 0
    || ["work_id", "mapping_id", "source_id", "source_revision", "policy_revision", "action", "attempt_cycle"].some(key => actual[key as keyof typeof actual] !== expected[key as keyof typeof expected])
    || actual.state !== "leased" || actual.attempt !== 1 || actual.lease_generation !== lease.lease_generation || lease.lease_generation <= expected.lease_generation
    || Date.parse(lease.expires_at) <= Date.parse(lease.server_time)) throw new Error("Targeted attention claim changed the admitted successor or fence.");
}
/** Discover only positive Core admission events; old attention work is never reclaimed. */
export async function synchronizeCmsAttentionRecoveries(options: CmsAttentionOptions) {
  return withNativeSourceWriter(options.docsDir, options.stateFile, async () => {
    const client = new CmsClient(options);
    if (!await supports(client)) return { supported: false, installed: [] as string[], blocked: [] as string[] };
    const state = await readCmsState(options.stateFile, emptyCmsState(client, options.siteUrl, options.connectionId)), recovery = await readAttentionState(options);
    for (let count = 0; ; count++) {
      if (count >= 128) throw new Error("Attention recovery feed did not terminate within its local page bound.");
      const page = await client.request<Page<AttentionRecovery>>("V4-35", { query: { after: recovery.recoveriesAfter } });
      pageOrder(page, recovery.recoveriesAfter, item => recovery.recoveries[item.recovery_id]?.event);
      for (const event of page.items) { recovery.recoveries[event.recovery_id] ??= { event, phase: "observed" }; await writeAttentionState(options, recovery); }
      recovery.recoveriesAfter = page.next_after; await writeAttentionState(options, recovery);
      if (!page.has_more) break;
    }
    const installed: string[] = [], blocked: string[] = [];
    for (const saved of Object.values(recovery.recoveries)) {
      if (saved.phase === "installed") continue;
      const event = saved.event, inspection = recovery.inspections[event.inspection_id], old = state.transactions[event.predecessor_work_id];
      if (!inspection?.observation || inspection.result?.status !== "ready" || inspection.instruction.context_sha256 !== event.context_sha256
        || inspection.instruction.work.work_id !== event.predecessor_work_id || inspection.instruction.work.attempt_cycle !== event.predecessor_attempt_cycle || !old
        || event.mapping.mapping_id !== old.lease.work.mapping_id || event.work.mapping_id !== event.mapping.mapping_id || event.work.source_id !== old.lease.work.source_id
        || event.work.policy_revision !== old.lease.work.policy_revision || event.source && (event.source.source_id !== event.work.source_id || event.source.source_revision !== event.work.source_revision)) {
        saved.phase = "blocked"; blocked.push(event.recovery_id); await writeAttentionState(options, recovery); continue;
      }
      const existing = state.transactions[event.work.work_id];
      if (existing) {
        if (!same(existing.attentionRecovery, event)) throw new Error("Recovery successor already has unrelated local history.");
        saved.phase = "installed"; await writeAttentionState(options, recovery); installed.push(event.work.work_id); continue;
      }
      saved.claim ??= { mutation_id: randomUUID(), work_id: event.work.work_id }; await writeAttentionState(options, recovery);
      saved.lease ??= await client.request<CmsLease | undefined>("V4-36", { path: { recovery_id: event.recovery_id }, body: saved.claim });
      if (!saved.lease) { blocked.push(event.recovery_id); continue; }
      assertSuccessor(event, saved.lease); saved.phase = "claimed"; await writeAttentionState(options, recovery);
      // Read back the actual native object after the NEW lease, without using the
      // old terminal lease as authority, before installing any new native plan.
      const actual = await collectCmsAttentionNative(options, inspection.instruction, state, client, recovery, event), previous = inspection.observation;
      const current = await client.query(event.work.work_id);
      const admittedState = event.mode === "settle_restored_baseline" ? "restored_baseline" : previous.native_state;
      if (actual.issue !== "none" || actual.native_state !== admittedState || !["baseline", "never_applied", "restored_baseline"].includes(actual.native_state)
        || ["journal_sha256", "baseline_sha256", "candidate_sha256", "current_sha256", "native_id", "native_revision"].some(key => actual[key as keyof AttentionObservation] !== previous[key as keyof AttentionObservation])
        || !same(actual.native_result, event.native_baseline) || !same(current.mapping, event.mapping) || !same(current.work, saved.lease.work)
        || state.generations[event.work.mapping_id] >= saved.lease.lease_generation) {
        saved.phase = "blocked"; blocked.push(event.recovery_id); await writeAttentionState(options, recovery); continue;
      }
      const transaction = stageCmsClaim(state, saved.lease); transaction.attentionRecovery = event;
      state.mappings[event.work.source_id] = event.mapping;
      await writeCmsState(options.stateFile, state);
      saved.phase = "installed"; await writeAttentionState(options, recovery); installed.push(event.work.work_id);
    }
    return { supported: true, installed, blocked };
  });
}
