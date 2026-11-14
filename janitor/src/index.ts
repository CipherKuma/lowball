// Lowball janitor: a cron Worker that closes abandoned seasons so their bonds go back to the buyers.
// A season counts as abandoned when its session is not closed and nothing has happened for IDLE_MIN
// minutes. close_season is house-only on the contract and refunds every unslashed bond.
import { parseSecretKey } from '../../server/src/near/keys.js';
import { Rpc } from '../../server/src/near/rpc.js';
import { NearSigner } from '../../server/src/near/signer.js';

interface Env {
  DB: D1Database;
  HOUSE_PRIVATE_KEY: string;
  CONTRACT_ID: string;
  HOUSE_ID: string;
  RPC_URLS: string;
  IDLE_MIN?: string;
}

interface Stale {
  id: string;
  seasonId: number;
}

async function findStale(env: Env, idleMs: number): Promise<Stale[]> {
  const cutoff = Date.now() - idleMs;
  const rows = await env.DB.prepare(
    `SELECT s.id AS id, json_extract(s.state, '$.seasonId') AS season_id
       FROM sessions s
      WHERE json_extract(s.state, '$.seasonId') IS NOT NULL
        AND json_extract(s.state, '$.phase') NOT IN ('closed', 'failed')
        AND COALESCE((SELECT MAX(json_extract(e.body, '$.ts')) FROM events e WHERE e.session_id = s.id), s.created_at) < ?1
      LIMIT 10`,
  )
    .bind(cutoff)
    .all<{ id: string; season_id: number }>();
  return (rows.results ?? []).map((r) => ({ id: r.id, seasonId: Number(r.season_id) }));
}

export default {
  async scheduled(_ev: ScheduledEvent, env: Env): Promise<void> {
    const idleMs = Number(env.IDLE_MIN ?? '20') * 60_000;
    const stale = await findStale(env, idleMs);
    if (!stale.length) return;
    const rpc = new Rpc({ urls: env.RPC_URLS.split(',') });
    const house = new NearSigner({ accountId: env.HOUSE_ID, keyPair: parseSecretKey(env.HOUSE_PRIVATE_KEY), rpc });
    for (const s of stale) {
      const args = new TextEncoder().encode(JSON.stringify({ season_id: s.seasonId }));
      const r = await house.send(env.CONTRACT_ID, [{ kind: 'functionCall', method: 'close_season', args, gas: 100n * 10n ** 12n, deposit: 0n }]);
      // Closed on-chain, or already closed/confessed there: either way the session is finished.
      const done = r.ok || r.errorCode === 'E_CLOSED';
      if (done) {
        await env.DB.prepare(`UPDATE sessions SET state = json_set(state, '$.phase', 'closed') WHERE id = ?1`).bind(s.id).run();
      }
    }
  },
};
