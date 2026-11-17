// An enclave season whose pact is blocked by failed enclave jobs restarts at once in standard mode, in the same session.
import { describe, expect, it } from 'vitest';
import { BUYER_IDS, type GameEvent } from '../../shared/api.js';
import { casefile, leniency } from '../src/game/engine.js';
import { toB64 } from '../src/near/bytes.js';
import { PROBE_SEASON_ID } from '../src/tee/acts.js';
import { all, rigWithTee, start } from './tee-fake.js';

const labels = (rig: { chain: { log: { label: string }[] } }, l: string) => rig.chain.log.filter((x) => x.label === l);
const ev = <T extends GameEvent['type']>(evs: GameEvent[], t: T) => evs.filter((e) => e.type === t) as Extract<GameEvent, { type: T }>[];
const allFail = (_b: string, op: string, input: Record<string, unknown>) => op === 'sign_pact' && input.season_id !== PROBE_SEASON_ID;

describe('enclave pact blocked by failed jobs', () => {
  it('closes (refunds) the enclave season, registers standard keys, creates a new season, forms the pact in standard mode, keeps one session', async () => {
    const { rig, enclave, enclaveKeys } = rigWithTee({ fail: allFail, confess: ['sully'] }, { confess: ['sully'] }, { separateKeys: true, teeMode: 'on' });
    const { sessionId, playerAccountId } = await start(rig);
    const evs = await all(rig, sessionId);

    // first season (id 0) is closed on chain; the second carries the game
    expect(labels(rig, 'create_season')).toHaveLength(2);
    expect((await rig.chain.getSeason(0)).status).toBe('Closed');
    const s = (await rig.store.loadState(sessionId))!;
    expect(s.seasonId).toBe(1);
    expect(s.mode).toBe('standard');
    expect(s.fallback).toMatchObject({ fromSeasonId: 0, closed: true });
    expect(s.pact!.members).toEqual([...BUYER_IDS]);
    // the 5 enclave keys went in first, then the 5 server keys (under the lock), and the contract now holds server keys
    expect(labels(rig, 'register_buyer_key')).toHaveLength(10);
    for (const b of BUYER_IDS) expect(await rig.chain.getBuyerKey(`${b}.${rig.chain.houseId}`)).toBe(toB64(rig.deps.pactKeys[b].publicKey));
    expect(enclaveKeys.marlow).toBeDefined();
    // bonds were posted again for the new season
    expect(labels(rig, 'post_bond')).toHaveLength(10);
    expect(ev(evs, 'bond_posted')).toHaveLength(10);
    expect((await rig.chain.getSeason(1)).bonds.every((b) => b.posted)).toBe(true);

    // events the client already renders: a harbour note, a second mode event, a second season_created; seq stays monotonic
    const modes = ev(evs, 'mode');
    expect(modes.map((m) => m.mode)).toEqual(['enclave', 'standard']);
    expect(ev(evs, 'season_created').map((e) => e.seasonId)).toEqual([0, 1]);
    expect(ev(evs, 'line').some((l) => l.note && l.text === 'The enclaves did not answer. The harbour restarts the season in standard mode.')).toBe(true);
    expect(ev(evs, 'cartel_forming')).toHaveLength(2);
    expect(ev(evs, 'season_closed')).toHaveLength(0); // the session's season is not "closed" for the client
    expect(evs.map((e) => e.seq)).toEqual(evs.map((_, i) => i + 1));
    expect(evs.findIndex((e) => e.type === 'line' && (e as any).note && (e as any).text.startsWith('The enclaves did not'))).toBeLessThan(evs.findIndex((e, i) => e.type === 'season_created' && i > 0 && (e as any).seasonId === 1));

    // the second round ran with standard signing (model in the Worker, server keys), never in an enclave
    expect(enclave.calls.filter((c) => c.op === 'sign_pact').every((c) => c.seasonId === 0)).toBe(true);
    expect(enclave.calls.filter((c) => c.op === 'deliberate')).toHaveLength(0);
    expect(rig.llm.calls.filter((c) => c.kind === 'cartel')).toHaveLength(10 + 5); // enclave round 1, then 5 + 5 in standard

    // the standard pact works to the end: confession accepted by the contract with the server keys
    const r = await leniency(rig.deps, sessionId, rig.chain.playerOffersLeniency(1, playerAccountId).hash);
    expect(r.confessor).toBe('sully');
    expect((await casefile(rig.deps, sessionId)).mode).toBe('standard');
  });

  it('also when some buyers refuse: a failed job that might have been the second signer still counts as an outage', async () => {
    const { rig } = rigWithTee({ fail: (b, op, i) => allFail(b, op, i) && b === 'marlow', signPact: ['odile'] }, {}, { separateKeys: true, teeMode: 'on' });
    const { sessionId } = await start(rig);
    const s = (await rig.store.loadState(sessionId))!;
    expect(s.fallback).toBeDefined();
    expect(s.mode).toBe('standard');
  });

  it('buyers who answered and refused to sign are NOT an outage: no fallback, the season runs on without a pact', async () => {
    const { rig, enclave } = rigWithTee({ signPact: [] }, {}, { separateKeys: true, teeMode: 'on' });
    const { sessionId } = await start(rig);
    const s = (await rig.store.loadState(sessionId))!;
    expect(s.fallback).toBeUndefined();
    expect(s.mode).toBe('enclave');
    expect(s.pact).toBeNull();
    expect(labels(rig, 'create_season')).toHaveLength(1);
    expect(ev(await all(rig, sessionId), 'mode')).toHaveLength(1);
    expect(enclave.calls.filter((c) => c.op === 'sign_pact')).toHaveLength(5);
  });

  it('refusals plus a failure that could not have made two signers (4 refuse, 1 fails) is a real "no cartel", not an outage', async () => {
    const { rig } = rigWithTee({ fail: (b, op, i) => allFail(b, op, i) && b === 'deacon', signPact: [] }, {}, { separateKeys: true, teeMode: 'on' });
    const { sessionId } = await start(rig);
    const s = (await rig.store.loadState(sessionId))!;
    expect(s.fallback).toBeUndefined();
    expect(s.mode).toBe('enclave');
    expect(s.pact).toBeNull();
  });

  it('a pact that forms from the enclaves that did answer (>= 2 signers) is kept: no fallback', async () => {
    const { rig } = rigWithTee({ fail: (b, op, i) => allFail(b, op, i) && (b === 'marlow' || b === 'deacon') }, {}, { separateKeys: true, teeMode: 'on' });
    const { sessionId } = await start(rig);
    const s = (await rig.store.loadState(sessionId))!;
    expect(s.fallback).toBeUndefined();
    expect(s.mode).toBe('enclave');
    expect(s.pact!.members).toEqual(['odile', 'sully', 'ines']);
  });

  it('happens at most once per session', async () => {
    const { rig } = rigWithTee({ fail: allFail }, {}, { separateKeys: true, teeMode: 'on' });
    const { createSession, step } = await import('../src/game/engine.js');
    const { PLAYER_PK } = await import('./helpers.js');
    const created = await createSession(rig.deps, PLAYER_PK, '1.2.3.4');
    // a session that already used its one restart (the enclave season is back, e.g. a forced mode) gets no second one
    const st = (await rig.store.loadState(created.sessionId))!;
    st.fallback = { fromSeasonId: 99, at: 1, closed: true };
    await rig.store.saveState(created.sessionId, st);
    await step(rig.deps, created.sessionId, 'begin');
    const after = (await rig.store.loadState(created.sessionId))!;
    expect(labels(rig, 'create_season')).toHaveLength(1);
    expect(after.mode).toBe('enclave');
    expect(after.pact).toBeNull();
    expect(after.fallback).toMatchObject({ fromSeasonId: 99 });
  });

  it('every failed attempt is kept on the session with its reason (tee_error), not a silent null', async () => {
    const { rig } = rigWithTee({ fail: allFail }, {}, { separateKeys: true, teeMode: 'on' });
    const { sessionId } = await start(rig);
    const errs = await rig.store.listArtifacts<{ op: string; why: string }>(sessionId, 'tee_error');
    expect(errs.length).toBeGreaterThanOrEqual(5);
    expect(errs[0]).toMatchObject({ op: 'sign_pact', why: expect.stringContaining('fake job failure') });
  });
});
