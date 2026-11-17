// The auto-mode health probe is a real sign_pact on a synthetic pact, and health is judged by pact-path jobs only.
import { describe, expect, it } from 'vitest';
import { BUYER_IDS } from '../../shared/api.js';
import { GameCtx } from '../src/game/ctx.js';
import { newState } from '../src/game/state.js';
import { buyerInfos } from '../src/game/cast.js';
import { toB64 } from '../src/near/bytes.js';
import { generateKeyPair, sign } from '../src/near/keys.js';
import { PROBE_NONCE, PROBE_OP, PROBE_SEASON_ID } from '../src/tee/acts.js';
import { assessHealth, chooseMode } from '../src/tee/mode.js';
import type { TeeJobRow } from '../src/store/types.js';
import { rigWithTee } from './tee-fake.js';

const NOW = Date.now();
const row = (op: string, ok: boolean, agoMin = 1): TeeJobRow => ({ at: NOW - agoMin * 60_000, buyer: 'marlow', op, ok, ms: 5000 });

function ctxFor(rig: ReturnType<typeof rigWithTee>['rig']) {
  const state = newState({ playerAccountId: 'p.testnet', playerPublicKey: '', contractId: rig.chain.contractId, buyers: buyerInfos(rig.chain.houseId), days: 3, bondYocto: '1', seed: 1 });
  return new GameCtx('s1', state, rig.deps);
}

describe('probe_pact', () => {
  it('runs the real sign_pact op on a fixed synthetic pact that no real season can share, as probe_pact', async () => {
    const { rig, enclave } = rigWithTee({}, {}, { teeMode: 'auto' });
    const r = await rig.deps.tee!.probe(ctxFor(rig), 'marlow', 60_000);
    expect(r.ok).toBe(true);
    expect(enclave.calls).toEqual([{ buyer: 'marlow', op: 'sign_pact', cap: 60_000, seasonId: PROBE_SEASON_ID }]);
    expect(PROBE_SEASON_ID).toBe(Number.MAX_SAFE_INTEGER);
    expect(PROBE_NONCE).toBe('4242424242');
    const jobs = await rig.store.recentTeeJobs(10);
    expect(jobs).toEqual([expect.objectContaining({ op: PROBE_OP, ok: true, buyer: 'marlow' })]);
  });

  it("is ok only when the output carries a signature that verifies against the buyer's enclave key", async () => {
    const other = generateKeyPair();
    // a signature by some other key
    const forged = rigWithTee({ tamper: (_b, out) => { out.signature = toB64(sign(other, new Uint8Array([1, 2, 3]))); } }, {}, { teeMode: 'auto' });
    const a = await forged.rig.deps.tee!.probe(ctxFor(forged.rig), 'marlow', 60_000);
    expect(a.ok).toBe(false);
    expect(a.reason).toContain('did not verify');
    // no signature at all (the buyer declined the drill pact)
    const declined = rigWithTee({ signPact: BUYER_IDS.filter((b) => b !== 'marlow') }, {}, { teeMode: 'auto' });
    expect((await declined.rig.deps.tee!.probe(ctxFor(declined.rig), 'marlow', 60_000)).ok).toBe(false);
    // an answer under a different public key than the registered one
    const wrongKey = rigWithTee({ tamper: (_b, out) => { out.public_key_b64 = toB64(other.publicKey); } }, {}, { teeMode: 'auto' });
    expect((await wrongKey.rig.deps.tee!.probe(ctxFor(wrongKey.rig), 'marlow', 60_000)).ok).toBe(false);
    // a null output (the 17 Nov failure: the guest ran, OutLayer stored nothing) carries OutLayer's own words
    const empty = rigWithTee({}, {}, { teeMode: 'auto' });
    (empty.rig.deps.tee as any).transport = { run: async () => ({ output: null, txHash: 'x', ms: 3, error: 'Execution failed: output_storage_unpaid' }) };
    const c = await empty.rig.deps.tee!.probe(ctxFor(empty.rig), 'marlow', 60_000);
    expect(c.ok).toBe(false);
    expect(c.reason).toContain('output_storage_unpaid');
    for (const t of [forged, declined, wrongKey, empty]) expect((await t.rig.store.recentTeeJobs(5))[0]).toMatchObject({ op: PROBE_OP, ok: false });
  });

  it('chooseMode decides from the drill pact: a signing probe picks enclave, a failing one standard', async () => {
    const good = rigWithTee({}, {}, { teeMode: 'auto' });
    expect((await chooseMode(ctxFor(good.rig))).mode).toBe('enclave');
    const bad = rigWithTee({ tamper: (_b, out) => { out.signature = null; out.decision = 'refuse'; out.signed_message_sha256 = ''; } }, {}, { teeMode: 'auto' });
    expect((await chooseMode(ctxFor(bad.rig))).mode).toBe('standard');
  });
});

describe('health judges pact-path jobs only', () => {
  it('ignores the old `probe` op and confession jobs, however many are green', () => {
    const rows = [...Array.from({ length: 10 }, () => row('probe', true, 1)), row('deliberate', true, 1)];
    expect(assessHealth(rows, NOW).state).toBe('unknown');
    // green probes cannot hide red pact jobs
    const mixed = [...Array.from({ length: 6 }, () => row('probe', true, 1)), ...Array.from({ length: 4 }, () => row('sign_pact', false, 2))];
    expect(assessHealth(mixed, NOW).state).toBe('unhealthy');
  });

  it('counts sign_pact and probe_pact', () => {
    expect(assessHealth([row('probe_pact', true), row('sign_pact', true)], NOW).state).toBe('healthy');
    expect(assessHealth([row('probe_pact', false), row('sign_pact', false)], NOW).state).toBe('unhealthy');
  });

  it('chooseMode reads past newer non-pact rows to the pact ones, and runs no probe when they say unhealthy', async () => {
    const { rig, enclave } = rigWithTee({}, {}, { teeMode: 'auto' });
    for (let i = 0; i < 4; i++) await rig.store.addTeeJob({ at: Date.now() - 5000, buyer: 'marlow', op: 'sign_pact', ok: false, ms: 5000 });
    for (let i = 0; i < 12; i++) await rig.store.addTeeJob({ at: Date.now() - 1000, buyer: 'marlow', op: 'probe', ok: true, ms: 100 });
    const c = await chooseMode(ctxFor(rig));
    expect(c).toMatchObject({ mode: 'standard', reason: expect.stringContaining('unhealthy') });
    expect(enclave.calls).toHaveLength(0);
  });
});
