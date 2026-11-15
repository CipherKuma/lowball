import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { casefile, createSession, getEvents, leniency, step } from '../src/game/engine.js';
import { D1Store } from '../src/store/d1.js';
import { MemoryStore } from '../src/store/memory.js';
import type { Store } from '../src/store/types.js';
import { newState } from '../src/game/state.js';
import { makeRig, PLAYER_PK } from './helpers.js';

let proxy: Awaited<ReturnType<typeof getPlatformProxy>>;
let db: D1Database;

beforeAll(async () => {
  proxy = await getPlatformProxy({ configPath: new URL('../wrangler.toml', import.meta.url).pathname, persist: false });
  db = (proxy.env as { DB: D1Database }).DB;
  for (const file of ['0001_init.sql', '0002_spend.sql']) {
    const sql = readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8').replace(/^--.*$/gm, '');
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) await db.prepare(stmt).run();
  }
}, 30000);
afterAll(async () => {
  await proxy.dispose();
});

const sample = () =>
  newState({ playerAccountId: 'p.t', playerPublicKey: 'k', contractId: 'c.t', buyers: [], days: 3, bondYocto: '1', seed: 5 });

function storeContract(name: string, make: () => Store) {
  describe(`${name} store contract`, () => {
    it('round-trips state, locks, events, artifacts and rate counts', async () => {
      const s = make();
      const id = crypto.randomUUID();
      await s.createSession(id, sample(), '1.1.1.1');
      expect((await s.loadState(id))?.contractId).toBe('c.t');
      expect(await s.loadState(crypto.randomUUID())).toBeNull();
      const st = (await s.loadState(id))!;
      st.day = 4;
      await s.saveState(id, st);
      expect((await s.loadState(id))!.day).toBe(4);
      expect(await s.tryLock(id, 60_000)).toBe(true);
      expect(await s.tryLock(id, 60_000)).toBe(false);
      expect(await s.isLocked(id)).toBe(true);
      await s.unlock(id);
      expect(await s.tryLock(id, 60_000)).toBe(true);
      await s.unlock(id);
      for (const seq of [1, 2, 3]) await s.appendEvent(id, { type: 'holdout', seq, ts: seq });
      expect((await s.listEvents(id, 1, 10)).map((e) => e.seq)).toEqual([2, 3]);
      expect((await s.getEvent(id, 2))?.seq).toBe(2);
      expect(await s.lastSeq(id)).toBe(3);
      await s.addArtifact(id, 'tx', 'k1', { a: 1 });
      await s.addArtifact(id, 'tx', 'k1', { a: 2 });
      await s.addArtifact(id, 'receipt', 'r1', { b: 1 });
      expect(await s.listArtifacts(id, 'tx')).toEqual([{ a: 2 }]);
      expect(await s.countSessionsSince('1.1.1.1', Date.now() - 1000)).toBeGreaterThanOrEqual(1);
      expect(await s.countSessionsSince('2.2.2.2', 0)).toBe(0);
    });

    it('lists a player\'s sessions newest first and exposes created_at', async () => {
      const s = make();
      const acct = `list-${crypto.randomUUID()}.t`;
      const ids = [crypto.randomUUID(), crypto.randomUUID()];
      for (const id of ids) {
        await s.createSession(id, { ...sample(), playerAccountId: acct }, '3.3.3.3');
        await new Promise((r) => setTimeout(r, 3));
      }
      const rows = await s.listSessionsByPlayer(acct, 10);
      expect(rows.map((r) => r.id)).toEqual([ids[1], ids[0]]);
      expect(rows[0]!.createdAt).toBeGreaterThanOrEqual(rows[1]!.createdAt);
      expect((await s.getSessionRow(ids[0]!))?.createdAt).toBe(rows[1]!.createdAt);
      expect(await s.getSessionRow(crypto.randomUUID())).toBeNull();
      expect(await s.listSessionsByPlayer(acct, 1)).toHaveLength(1);
    });

    it('has a cross-session lock and keeps the newest enclave jobs first', async () => {
      const s = make();
      const name = `lock-${crypto.randomUUID()}`;
      expect(await s.tryGlobalLock(name, 60_000)).toBe(true);
      expect(await s.tryGlobalLock(name, 60_000)).toBe(false);
      await s.releaseGlobalLock(name);
      expect(await s.tryGlobalLock(name, 60_000)).toBe(true);
      await s.releaseGlobalLock(name);
      const t = Date.now() + 10_000_000;
      await s.addTeeJob({ at: t, buyer: 'marlow', op: 'sign_pact', ok: true, ms: 1234 });
      await s.addTeeJob({ at: t + 1, buyer: 'odile', op: 'probe', ok: false, ms: 99 });
      const jobs = await s.recentTeeJobs(2);
      expect(jobs).toEqual([
        { at: t + 1, buyer: 'odile', op: 'probe', ok: false, ms: 99 },
        { at: t, buyer: 'marlow', op: 'sign_pact', ok: true, ms: 1234 },
      ]);
    });

    it('keeps the spend ledger and the per-session voice counter', async () => {
      const s = make();
      const before = await s.totalSpendUsd();
      await s.addSpend({ model: 'm', promptTokens: 100, completionTokens: 10, usd: 0.25 });
      await s.addSpend({ model: 'm', promptTokens: 100, completionTokens: 10, usd: 0.5 });
      expect((await s.totalSpendUsd()) - before).toBeCloseTo(0.75, 10);
      const id = crypto.randomUUID();
      expect(await s.reserveTts(id, 2)).toBe(true);
      expect(await s.reserveTts(id, 2)).toBe(true);
      expect(await s.reserveTts(id, 2)).toBe(false);
      await s.releaseTts(id);
      expect(await s.reserveTts(id, 2)).toBe(true);
      expect(await s.reserveTts(crypto.randomUUID(), 2)).toBe(true);
    });
  });
}
storeContract('MemoryStore', () => new MemoryStore());
storeContract('D1Store', () => new D1Store(db));

describe('full season on D1', () => {
  it('runs a confession flow end to end through D1Store', async () => {
    const rig = makeRig({ confess: ['ines', 'marlow'] });
    const deps = { ...rig.deps, store: new D1Store(db) };
    const { sessionId, playerAccountId } = await createSession(deps, PLAYER_PK, 'ip');
    await step(deps, sessionId, 'begin');
    await step(deps, sessionId, 'sell');
    const tx = rig.chain.playerOffersLeniency(0, playerAccountId);
    const r = await leniency(deps, sessionId, tx.hash);
    expect(r.confessor).not.toBeNull();
    const { events, status } = await getEvents(deps, sessionId, 0);
    events.forEach((e, i) => expect(e.seq).toBe(i + 1));
    expect(status.phase).toBe('closed');
    const cf = await casefile(deps, sessionId);
    expect(cf.receipts.length).toBeGreaterThan(5);
    expect(cf.txs.length).toBeGreaterThan(15);
  });
});
