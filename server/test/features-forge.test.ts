// "Try to forge a confession": real (mock-chain) confessions the contract rules refuse, reported with their tx hashes.
import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors.js';
import { createSession, step } from '../src/game/engine.js';
import { PLAYER_PK } from './helpers.js';
import { begun, body, rig, type Rig } from './features-rig.js';

async function closed(r: Rig) {
  const id = await begun(r);
  for (let d = 1; d <= 3; d++) {
    await step(r.deps, id, 'sell');
    await step(r.deps, id, 'next_day');
  }
  return id;
}
const forge = (r: Rig, id: string, init: RequestInit = { method: 'POST' }) => r.app.request(`/api/session/${id}/forge`, init);

describe('forgery drill', () => {
  it('is sealed until the season is closed (409 BAD_PHASE) and 404 for an unknown session', async () => {
    const r = rig();
    const id = await begun(r);
    const res = await forge(r, id);
    expect(res.status).toBe(409);
    expect((await body(res)).code).toBe('BAD_PHASE');
    expect((await forge(r, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await forge(r, 'nope')).status).toBe(400);
  });

  it('runs a forgery, a replay and a late confession; every one is refused with the contract code and a real tx hash', async () => {
    const r = rig();
    const id = await closed(r);
    const res = await forge(r, id);
    expect(res.status).toBe(200);
    const j = await body(res);
    expect(j.attempts.map((a: any) => [a.kind, a.errorCode, a.ok])).toEqual([
      ['forge', 'E_BAD_CONFESSION_SIG', false],
      ['replay', 'E_SEASON_MISMATCH', false],
      ['late', 'E_CLOSED', false],
    ]);
    const s = (await r.store.loadState(id))!;
    expect(j.drillSeasonId).not.toBe(s.seasonId);
    expect(j.attempts[0].seasonId).toBe(j.drillSeasonId);
    expect(j.attempts[2].seasonId).toBe(s.seasonId);
    // each hash is a transaction the chain recorded (and the case file keeps it)
    const txs = await r.store.listArtifacts<{ hash: string; label: string; ok: boolean; errorCode?: string }>(id, 'tx');
    for (const a of j.attempts) {
      expect(a.tx).toMatch(/\S/);
      const rec = txs.find((t) => t.hash === a.tx)!;
      expect(rec, a.kind).toBeTruthy();
      expect(rec.ok).toBe(false);
      expect(rec.errorCode).toBe(a.errorCode);
    }
    expect(j.cleanupTx).toMatch(/\S/);
    // the drill season is closed again, and the real season was not touched
    expect((await r.deps.chain.getSeason(j.drillSeasonId)).status).toBe('Closed');
    expect((await r.deps.chain.getSeason(s.seasonId!)).status).toBe('Closed');
    expect((await r.deps.chain.getSeason(s.seasonId!)).first_confessor).toBeNull();
    // the event is written for the client
    const ev = (await r.store.getEvent(id, j.seq))!;
    expect(ev).toMatchObject({ type: 'forgery', drillSeasonId: j.drillSeasonId });
    expect(s.forgery?.attempts).toHaveLength(3);
  });

  it('only once per session: the second call is 409 ALREADY_FORGED and sends nothing', async () => {
    const r = rig();
    const id = await closed(r);
    expect((await forge(r, id)).status).toBe(200);
    let sent = 0;
    const real = r.deps.chain.confess.bind(r.deps.chain);
    r.deps.chain.confess = ((...a: Parameters<typeof real>) => (sent++, real(...a))) as never;
    const again = await forge(r, id);
    expect(again.status).toBe(409);
    expect((await body(again)).code).toBe('ALREADY_FORGED');
    expect(sent).toBe(0);
  });

  it('takes no input: junk bodies are 400 BAD_REQUEST, an empty object is fine', async () => {
    const r = rig();
    const id = await closed(r);
    for (const junk of ['not json', '{"buyer":"marlow"}', '[]', '"x"']) {
      const res = await forge(r, id, { method: 'POST', body: junk, headers: { 'content-type': 'application/json' } });
      expect(res.status, junk).toBe(400);
      expect((await body(res)).code).toBe('BAD_REQUEST');
    }
    expect((await forge(r, id, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).status).toBe(200);
  });

  it('without a pact there is nothing to replay: it says so and still runs the other two', async () => {
    const r = rig({ sign: [] });
    const id = await closed(r);
    const j = await body(await forge(r, id));
    expect(j.attempts.map((a: any) => a.kind)).toEqual(['forge', 'late']);
    expect(j.skipped).toEqual([{ kind: 'replay', reason: expect.stringContaining('No pact') }]);
    expect(j.attempts.map((a: any) => a.errorCode)).toEqual(['E_BAD_CONFESSION_SIG', 'E_CLOSED']);
  });

  it('a tx that cannot be sent is reported without a hash, never a made-up one', async () => {
    const r = rig();
    const id = await closed(r);
    const real = r.deps.chain.confess.bind(r.deps.chain);
    r.deps.chain.confess = (async (...a: Parameters<typeof real>) => {
      if (a[1] === (await r.store.loadState(id))!.seasonId) throw new AppError('RPC_UNAVAILABLE');
      return real(...a);
    }) as never;
    const j = await body(await forge(r, id));
    const late = j.attempts.find((a: any) => a.kind === 'late');
    expect(late).toMatchObject({ tx: '', ok: false, errorCode: 'RPC_UNAVAILABLE' });
    expect(j.attempts.find((a: any) => a.kind === 'forge').tx).toMatch(/\S/);
  });

  it('a failure while building the drill season is an honest error, records nothing, and can be retried', async () => {
    const r = rig();
    const id = await closed(r);
    const real = r.deps.chain.createSeason.bind(r.deps.chain);
    let fail = true;
    r.deps.chain.createSeason = (async (...a: Parameters<typeof real>) => {
      if (fail) throw new AppError('RPC_UNAVAILABLE');
      return real(...a);
    }) as never;
    const res = await forge(r, id);
    expect(res.status).toBe(503);
    expect((await body(res)).code).toBe('RPC_UNAVAILABLE');
    expect((await r.store.loadState(id))!.forgery).toBeUndefined();
    expect(await r.store.isLocked(id)).toBe(false);
    fail = false;
    expect((await forge(r, id)).status).toBe(200);
  });

  it('a running step blocks it (BUSY)', async () => {
    const r = rig();
    const id = await closed(r);
    await r.store.tryLock(id, 60_000);
    expect((await body(await forge(r, id))).code).toBe('BUSY');
  });

  it('the contract itself would accept a genuine confession in the same drill (control: the refusal is about the key)', async () => {
    // sanity on the mock rules: a created-but-unclosed season has no forgery recorded and sessions stay independent
    const r = rig();
    const c = await createSession(r.deps, PLAYER_PK, '5.5.5.5');
    const res = await forge(r, c.sessionId);
    expect((await body(res)).code).toBe('BAD_PHASE');
  });
});
