// Enclave mode (deps.teeMode unset: enclave whenever deps.tee is set) against MockChain and a faked OutLayer transport. The fake enclave plays the guest program
// (outlayer/src/main.rs): it composes the signed bytes itself and signs with the buyer's "TEE key" (the key the
// mock chain registered). The real guest and transport are exercised on testnet (research/outlayer-integration.md).
import { describe, expect, it } from 'vitest';
import { BUYER_IDS, type BuyerId, type GameEvent } from '../../shared/api.js';
import { casefile, createSession, leniency, step } from '../src/game/engine.js';
import { toB64 } from '../src/near/bytes.js';
import { all, rigWithTee, start, types } from './tee-fake.js';
import { PLAYER_PK } from './helpers.js';

describe('TEE_BUYERS=1', () => {
  it('pact and confession come from five enclave jobs each; the server signs nothing; the contract accepts it', async () => {
    const { rig, enclave } = rigWithTee({ confess: ['sully', 'ines'] });
    const { sessionId, playerAccountId } = await start(rig);
    expect(enclave.calls.filter((c) => c.op === 'sign_pact')).toHaveLength(5);
    // no server-side round-2 cartel call: the scripted model only did round 1
    expect(rig.llm.calls.filter((c) => c.kind === 'cartel')).toHaveLength(5);
    const tx = rig.chain.playerOffersLeniency(0, playerAccountId);
    const r = await leniency(rig.deps, sessionId, tx.hash);
    expect(['sully', 'ines']).toContain(r.confessor);
    expect(enclave.calls.filter((c) => c.op === 'deliberate')).toHaveLength(5);
    expect(rig.llm.calls.filter((c) => c.kind === 'deliberate')).toHaveLength(0);
    const evs = await all(rig, sessionId);
    const tee = evs.filter((e) => e.type === 'tee_signed') as Extract<GameEvent, { type: 'tee_signed' }>[];
    expect(tee.filter((e) => e.act === 'pact')).toHaveLength(5);
    expect(tee.filter((e) => e.act === 'confession')).toHaveLength(5);
    expect(tee[0]).toMatchObject({ attestationUrl: expect.stringContaining('/attestations/by-tx/tx-sign_pact-'), wasmSha256: expect.stringMatching(/-sha$/) });
    const view = await rig.chain.getSeason(0);
    expect(view.first_confessor).toBe(`${r.confessor}.${rig.chain.houseId}`);
    expect(view.verified_signers).toHaveLength(5);
    // the case file lists every enclave act with its evidence
    expect((await rig.store.loadState(sessionId))!.phase).toBe('closed');
    const cf = await casefile(rig.deps, sessionId);
    expect(cf.tee).toHaveLength(10);
    expect(cf.tee![0]).toMatchObject({ signatureVerified: true, publicKeyB64: expect.any(String) });
  });

  it('a buyer who refuses has no signature and does not deliberate; two signers still make a pact', async () => {
    const { rig, enclave } = rigWithTee({ signPact: ['marlow', 'odile'], confess: ['marlow'] });
    const { sessionId, playerAccountId } = await start(rig);
    const s = (await rig.store.loadState(sessionId))!;
    expect(s.pact!.members).toEqual(['marlow', 'odile']);
    expect(s.pact!.signatures).toHaveLength(2);
    expect(s.pact!.memberAccounts).toHaveLength(5);
    const r = await leniency(rig.deps, sessionId, rig.chain.playerOffersLeniency(0, playerAccountId).hash);
    expect(r.confessor).toBe('marlow');
    expect(enclave.calls.filter((c) => c.op === 'deliberate').map((c) => c.buyer).sort()).toEqual(['marlow', 'odile']);
  });

  it('fewer than two signers: no pact, no deliberation jobs, holdout no_pact', async () => {
    const { rig, enclave } = rigWithTee({ signPact: ['marlow'] });
    const { sessionId, playerAccountId } = await start(rig);
    const r = await leniency(rig.deps, sessionId, rig.chain.playerOffersLeniency(0, playerAccountId).hash);
    expect(r.confessor).toBeNull();
    expect(enclave.calls.filter((c) => c.op === 'deliberate')).toHaveLength(0);
    expect(types(await all(rig, sessionId))).toContain('holdout');
  });

  it('a job that fails after its retry means that buyer abstains with an honest note; the season is never blocked', async () => {
    const { rig, enclave } = rigWithTee({ fail: (b) => b === 'deacon' });
    const created = await createSession(rig.deps, PLAYER_PK, '1.2.3.4');
    await step(rig.deps, created.sessionId, 'begin');
    const evs = await all(rig, created.sessionId);
    const note = evs.find((e) => e.type === 'line' && (e as any).note === true) as Extract<GameEvent, { type: 'line' }>;
    expect(note).toMatchObject({ buyer: 'deacon', text: expect.stringContaining('enclave never answered') });
    expect(evs.filter((e) => e.type === 'error')).toHaveLength(0);
    const s = (await rig.store.loadState(created.sessionId))!;
    expect(s.pact!.members).toEqual(['marlow', 'odile', 'sully', 'ines']);
    expect(s.pact!.signatures).toHaveLength(4);
    expect(s.phase).toBe('lot_open');
    // two attempts for the dead buyer, one for each of the others
    expect(enclave.calls.filter((c) => c.buyer === 'deacon' && c.op === 'sign_pact')).toHaveLength(2);
    expect(rig.deps.tee!.stats).toMatchObject({ failedJobs: 1 });
    // both attempts share one 90 s budget: the first is capped at 55 s, the retry gets the rest
    const caps = enclave.calls.filter((c) => c.buyer === 'deacon').map((c) => c.cap!);
    expect(caps[0]).toBe(55_000);
    expect(caps[1]).toBeGreaterThan(12_000);
    expect(caps[1]).toBeLessThanOrEqual(90_000);
    // round 1 was asked once per buyer and no server key signed anything
    expect(rig.llm.calls.filter((c) => c.kind === 'cartel')).toHaveLength(5);
  });

  it('one retry per job: a transient failure or an empty result is absorbed and counted; two in a row fail the job', async () => {
    const seen = new Set<string>();
    const { rig, enclave } = rigWithTee({ fail: (b, op) => b === 'ines' && !seen.has(op) && !!seen.add(op) });
    const created = await createSession(rig.deps, PLAYER_PK, '1.2.3.4');
    await step(rig.deps, created.sessionId, 'begin');
    expect((await rig.store.loadState(created.sessionId))!.pact!.members).toHaveLength(5);
    expect(enclave.calls.filter((c) => c.buyer === 'ines')).toHaveLength(2);
    const stats = rig.deps.tee!.stats;
    expect(stats).toMatchObject({ jobs: 5, failedAttempts: 1, failedJobs: 0 });
    const records = await rig.store.listArtifacts<{ buyer: string; attempts: number }>(created.sessionId, 'tee');
    expect(records.find((r) => r.buyer === 'ines')!.attempts).toBe(2);
    expect(records.find((r) => r.buyer === 'odile')!.attempts).toBe(1);
  });

  it.each([
    ['a signature from another key', (_b: BuyerId, o: Record<string, any>) => { o.signature = toB64(new Uint8Array(64).fill(7)); }],
    ['an enclave that is not the registered key', (_b: BuyerId, o: Record<string, any>) => { o.public_key_b64 = toB64(new Uint8Array(32).fill(1)); }],
    ['a decision that disagrees with the signature', (_b: BuyerId, o: Record<string, any>) => { o.decision = 'refuse'; }],
    ['a forged receipt', (_b: BuyerId, o: Record<string, any>) => { o.receipt.message += 'x'; }],
    ['a guest failure', (_b: BuyerId, o: Record<string, any>) => { for (const k of Object.keys(o)) delete o[k]; o.ok = false; o.error = 'caller not allowed'; }],
  ])('refuses %s from an enclave: that buyer abstains, nothing he returned is used', async (_n, tamper) => {
    const { rig } = rigWithTee({ tamper: (b, o) => b === 'ines' && tamper(b, o) });
    const created = await createSession(rig.deps, PLAYER_PK, '1.2.3.4');
    await step(rig.deps, created.sessionId, 'begin');
    const s = (await rig.store.loadState(created.sessionId))!;
    expect(s.pact!.members).toEqual(['marlow', 'odile', 'sully', 'deacon']);
    expect(s.pact!.signatures.map((x) => x.buyer)).not.toContain('ines');
    const evs = await all(rig, created.sessionId);
    expect(evs.some((e) => e.type === 'line' && (e as any).note && (e as any).buyer === 'ines')).toBe(true);
  });
});
