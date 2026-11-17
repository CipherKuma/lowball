// Per-season mode: enclave or standard, chosen right before create_season from enclave health (TEE_MODE=auto),
// with the buyers' registered keys switched to match under a cross-session lock. MockChain + a fake OutLayer.
import { describe, expect, it } from 'vitest';
import { BUYER_IDS, type GameEvent } from '../../shared/api.js';
import { casefile, createSession, getEvents, leniency, step } from '../src/game/engine.js';
import { toB64 } from '../src/near/bytes.js';
import { PROBE_SEASON_ID } from '../src/tee/acts.js';
import { assessHealth, HEALTH } from '../src/tee/mode.js';
import type { TeeJobRow } from '../src/store/types.js';
import { PLAYER_PK } from './helpers.js';
import { all, rigWithTee, start } from './tee-fake.js';

const NOW = 1_800_000_000_000;
const job = (agoMin: number, ok: boolean, ms = 20_000): TeeJobRow => ({ at: NOW - agoMin * 60_000, buyer: 'marlow', op: 'sign_pact', ok, ms });
const jobs = (n: number, okCount: number, agoMin = 1, ms = 20_000) =>
  Array.from({ length: n }, (_, i) => job(agoMin + i * 0.1, i < okCount, ms));

async function seed(store: { addTeeJob(j: TeeJobRow): Promise<void> }, rows: TeeJobRow[]) {
  for (const r of [...rows].reverse()) await store.addTeeJob({ ...r, at: Date.now() - (NOW - r.at) });
}
const modeEvent = (evs: GameEvent[]) => evs.find((e) => e.type === 'mode') as Extract<GameEvent, { type: 'mode' }>;
const registrations = (rig: { chain: { log: { label: string; signer: string }[] } }) => rig.chain.log.filter((l) => l.label === 'register_buyer_key');

describe('assessHealth', () => {
  it('healthy: 80% ok over the last 10, a success in 30 minutes, p90 under 75 s', () => {
    expect(assessHealth(jobs(10, 8), NOW).state).toBe('healthy');
    expect(assessHealth(jobs(10, 7), NOW).state).toBe('unhealthy');
    expect(assessHealth(jobs(10, 10, 1, 80_000), NOW).state).toBe('unhealthy');
    expect(assessHealth(jobs(10, 10, 1, 74_000), NOW).state).toBe('healthy');
  });
  it('no job in the last 30 minutes, or none ever, is "unknown" (a probe decides), not unhealthy', () => {
    expect(assessHealth([], NOW).state).toBe('unknown');
    expect(assessHealth(jobs(10, 10, 45), NOW).state).toBe('unknown');
  });
  it('a recent failure streak after old successes is unhealthy', () => {
    const rows = [...jobs(5, 0, 2), ...jobs(5, 5, 50)];
    expect(assessHealth(rows, NOW).state).toBe('unhealthy');
  });
});

describe('TEE_MODE=auto', () => {
  it('healthy enclaves: the season runs in enclave mode, enclave keys are registered first, and the case file says so', async () => {
    const { rig, enclave, enclaveKeys } = rigWithTee({ confess: ['sully'] }, {}, { separateKeys: true, teeMode: 'auto' });
    await seed(rig.store, jobs(10, 10));
    const { sessionId, playerAccountId } = await start(rig);
    const evs = await all(rig, sessionId);
    expect(modeEvent(evs)).toMatchObject({ mode: 'enclave', reason: expect.stringContaining('healthy') });
    expect(evs.filter((e) => e.type === 'mode')).toHaveLength(1);
    // the mode event comes before create_season
    expect(evs.findIndex((e) => e.type === 'mode')).toBeLessThan(evs.findIndex((e) => e.type === 'season_created'));
    // all five buyers had server keys registered, so all five were switched, each from its own account
    expect(registrations(rig)).toHaveLength(5);
    expect(registrations(rig).map((r) => r.signer).sort()).toEqual(BUYER_IDS.map((b) => `${b}.${rig.chain.houseId}`).sort());
    for (const b of BUYER_IDS) expect(await rig.chain.getBuyerKey(`${b}.${rig.chain.houseId}`)).toBe(toB64(enclaveKeys[b].publicKey));
    expect(enclave.calls.some((c) => c.op === 'probe')).toBe(false);
    // the enclave-signed pact and confession are accepted by the contract with the registered enclave keys
    const r = await leniency(rig.deps, sessionId, rig.chain.playerOffersLeniency(0, playerAccountId).hash);
    expect(r.confessor).toBe('sully');
    const cf = await casefile(rig.deps, sessionId);
    expect(cf.mode).toBe('enclave');
    expect(cf.tee!.length).toBe(10);
  });

  it('unhealthy enclaves: the season runs in standard mode, server keys are re-registered, no enclave job runs, confession works', async () => {
    const { rig, enclave, enclaveKeys } = rigWithTee({ confess: ['sully'] }, { confess: ['sully'] }, { separateKeys: true, teeMode: 'auto' });
    // the contract currently holds the enclave keys from an earlier enclave season
    for (const b of BUYER_IDS) await rig.chain.registerBuyerKey(b, toB64(enclaveKeys[b].publicKey));
    rig.chain.log.length = 0;
    await seed(rig.store, jobs(10, 3, 2));
    const { sessionId, playerAccountId } = await start(rig);
    const evs = await all(rig, sessionId);
    expect(modeEvent(evs)).toMatchObject({ mode: 'standard', reason: expect.stringContaining('unhealthy') });
    expect(registrations(rig)).toHaveLength(5);
    for (const b of BUYER_IDS) expect(await rig.chain.getBuyerKey(`${b}.${rig.chain.houseId}`)).toBe(toB64(rig.deps.pactKeys[b].publicKey));
    expect(enclave.calls).toHaveLength(0);
    expect(evs.some((e) => e.type === 'tee_signed')).toBe(false);
    // standard: the model's cartel round 2 and deliberation ran in the Worker and the server signed with its pact keys
    expect(rig.llm.calls.filter((c) => c.kind === 'cartel')).toHaveLength(10);
    const r = await leniency(rig.deps, sessionId, rig.chain.playerOffersLeniency(0, playerAccountId).hash);
    expect(r.confessor).toBe('sully');
    const cf = await casefile(rig.deps, sessionId);
    expect(cf.mode).toBe('standard');
    expect(cf.tee).toBeUndefined();
  });

  it('keys that already match the mode are not re-registered', async () => {
    const { rig } = rigWithTee({}, {}, { teeMode: 'auto' }); // enclave keys == server keys == registered
    await seed(rig.store, jobs(10, 10));
    await start(rig);
    expect(registrations(rig)).toHaveLength(0);
  });

  it('no recent data: ONE drill pact (the real sign_pact op, probe_pact in the job record) with a 60 s cap decides', async () => {
    const ok = rigWithTee({}, {}, { teeMode: 'auto' });
    await start(ok.rig);
    expect(ok.enclave.calls.filter((c) => c.seasonId === PROBE_SEASON_ID)).toEqual([{ buyer: 'marlow', op: 'sign_pact', cap: HEALTH.probeCapMs, seasonId: PROBE_SEASON_ID }]);
    expect(modeEvent(await all(ok.rig, [...ok.rig.store.states.keys()][0]!))).toMatchObject({ mode: 'enclave', reason: expect.stringContaining('drill pact') });
    expect((await ok.rig.store.recentTeeJobs(20)).filter((j) => j.op === 'probe_pact' && j.ok)).toHaveLength(1);

    const bad = rigWithTee({ fail: (_b, op, input) => op === 'sign_pact' && input.season_id === PROBE_SEASON_ID }, {}, { teeMode: 'auto' });
    await start(bad.rig);
    expect(modeEvent(await all(bad.rig, [...bad.rig.store.states.keys()][0]!))).toMatchObject({ mode: 'standard', reason: expect.stringContaining('probe failed') });
    expect(bad.enclave.calls.filter((c) => c.seasonId !== PROBE_SEASON_ID)).toHaveLength(0);
    // the failed probe now counts against the enclaves for the next sessions (no second probe within 30 minutes)
    expect((await bad.rig.store.recentTeeJobs(20)).some((j) => j.op === 'probe_pact' && !j.ok)).toBe(true);
  });

  it('TEE_MODE=on always uses enclaves, off never does, whatever the health data says', async () => {
    const on = rigWithTee({}, {}, { teeMode: 'on' });
    await seed(on.rig.store, jobs(10, 0));
    const a = (await start(on.rig)).sessionId;
    expect(modeEvent(await all(on.rig, a)).mode).toBe('enclave');
    const off = rigWithTee({}, {}, { teeMode: 'off' });
    await seed(off.rig.store, jobs(10, 10));
    const b = (await start(off.rig)).sessionId;
    expect(modeEvent(await all(off.rig, b)).mode).toBe('standard');
    expect(off.enclave.calls).toHaveLength(0);
  });

  it('enclave mode degrades per buyer: failed pact jobs abstain, a failed deliberation job stays silent, the rest go on', async () => {
    const { rig, enclave } = rigWithTee(
      { confess: ['sully', 'odile'], fail: (b, op) => (op === 'sign_pact' && (b === 'marlow' || b === 'deacon')) || (op === 'deliberate' && b === 'odile') },
      {},
      { separateKeys: true, teeMode: 'on' },
    );
    const { sessionId, playerAccountId } = await start(rig);
    let s = (await rig.store.loadState(sessionId))!;
    expect(s.pact!.members).toEqual(['odile', 'sully', 'ines']);
    const r = await leniency(rig.deps, sessionId, rig.chain.playerOffersLeniency(0, playerAccountId).hash);
    expect(r.confessor).toBe('sully'); // odile's job failed, so only sully confessed
    const evs = (await getEvents(rig.deps, sessionId, 0)).events;
    const notes = evs.filter((e) => e.type === 'line' && (e as any).note) as Extract<GameEvent, { type: 'line' }>[];
    expect(notes.map((n) => n.buyer).sort()).toEqual(['deacon', 'marlow', 'odile']);
    expect(notes.find((n) => n.buyer === 'odile')!.text).toContain('stays silent');
    expect(evs.filter((e) => e.type === 'error')).toHaveLength(0);
    // marlow and deacon never deliberate (they are not pact members); odile tried twice
    expect(enclave.calls.filter((c) => c.op === 'deliberate' && c.buyer === 'odile')).toHaveLength(2);
    s = (await rig.store.loadState(sessionId))!;
    expect(s.confessed).toBe(true);
  });

  it('a lock covers "register keys, then create_season": two sessions of different modes never interleave', async () => {
    const { rig, enclaveKeys } = rigWithTee({}, {}, { separateKeys: true, teeMode: 'on' });
    const a = await createSession(rig.deps, PLAYER_PK, '1.1.1.1');
    const depsB = { ...rig.deps, teeMode: 'off' as const }; // same chain, store and enclave client; the other mode
    const b = await createSession(depsB, PLAYER_PK, '2.2.2.2');
    rig.chain.log.length = 0;
    await Promise.all([step(rig.deps, a.sessionId, 'begin'), step(depsB, b.sessionId, 'begin')]);
    const seq = rig.chain.log.filter((l) => l.label === 'register_buyer_key' || l.label === 'create_season').map((l) => (l.label === 'create_season' ? 'C' : 'r'));
    // five registrations, then create_season, five registrations, then create_season (the order of the two sessions is free)
    expect(seq.join('')).toBe('rrrrrCrrrrrC');
    const states = await Promise.all([a, b].map(async (x) => (await rig.store.loadState(x.sessionId))!));
    expect(states.map((s) => s.mode).sort()).toEqual(['enclave', 'standard']);
    // each season's confession path works with the keys snapshotted for its own mode
    for (const s of states) expect((await rig.chain.getSeason(s.seasonId!)).status).toBe('Open');
    expect(await rig.chain.getBuyerKey(`marlow.${rig.chain.houseId}`)).not.toBeNull();
    expect(enclaveKeys.marlow).toBeDefined();
  });

  it('the lock is released after create_season, also when it fails, so the next session is never stuck', async () => {
    const { rig } = rigWithTee({}, {}, { teeMode: 'off' });
    const created = await createSession(rig.deps, PLAYER_PK, '1.1.1.1');
    const real = rig.chain.createSeason.bind(rig.chain);
    let first = true;
    rig.chain.createSeason = async (...a: Parameters<typeof real>) => (first ? ((first = false), { hash: 'x', ok: false, errorCode: 'TX_FAILED' as const, seasonId: undefined }) : real(...a));
    await expect(step(rig.deps, created.sessionId, 'begin')).rejects.toMatchObject({ code: 'TX_FAILED' });
    expect(await rig.store.tryGlobalLock('tee-mode', 1000)).toBe(true);
    await rig.store.releaseGlobalLock('tee-mode');
    await step(rig.deps, created.sessionId, 'begin');
    const evs = await all(rig, created.sessionId);
    expect(evs.filter((e) => e.type === 'mode')).toHaveLength(1); // announced once, even across a retried begin
  });
});
