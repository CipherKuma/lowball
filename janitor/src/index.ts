// Lowball janitor: a cron Worker that closes abandoned seasons so their bonds go back to the buyers.
// A season counts as abandoned when its session is not closed and nothing has happened for IDLE_MIN
// minutes. close_season is house-only on the contract and refunds every unslashed bond.
//
// It also keeps the OutLayer health record fresh. A season in TEE_MODE=auto runs a 60 s probe job when the
// newest enclave job is over 30 minutes old; players arrive hours apart, so nearly every one paid that wait.
// The janitor runs the same probe in the background instead, so a season only reads the record.
import deployedTee from '../../outlayer/deployed.json';
import type { GameCtx } from '../../server/src/game/ctx.js';
import { parseSecretKey } from '../../server/src/near/keys.js';
import { Rpc } from '../../server/src/near/rpc.js';
import { NearSigner } from '../../server/src/near/signer.js';
import { D1Store } from '../../server/src/store/d1.js';
import { TeeActs } from '../../server/src/tee/acts.js';
import { HEALTH } from '../../server/src/tee/mode.js';
import { OutlayerTransport } from '../../server/src/tee/outlayer.js';
import type { TeeDeployment } from '../../server/src/tee/types.js';

interface Env {
  DB: D1Database;
  HOUSE_PRIVATE_KEY: string;
  CONTRACT_ID: string;
  HOUSE_ID: string;
  RPC_URLS: string;
  IDLE_MIN?: string;
  /** "on" (default) keeps the enclave health record fresh; "off" when the server runs TEE_MODE=off */
  TEE_PROBE?: string;
}

/** Probe when the newest job is this old: the cron runs every 10 min, so the record never passes 30 min. */
const PROBE_AFTER_MS = 18 * 60_000;

async function keepTeeHealthFresh(env: Env, rpc: Rpc, signer: NearSigner): Promise<void> {
  const store = new D1Store(env.DB);
  const [newest] = await store.recentTeeJobs(1);
  if (newest && Date.now() - newest.at < PROBE_AFTER_MS) return;
  const deployment = deployedTee as unknown as TeeDeployment;
  const acts = new TeeActs(deployment, new OutlayerTransport({ deployment, signer, rpc }));
  // probe() only records its job through ctx.deps.store.
  await acts.probe({ deps: { store } } as unknown as GameCtx, 'marlow', HEALTH.probeCapMs);
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
    const rpc = new Rpc({ urls: env.RPC_URLS.split(',') });
    const house = new NearSigner({ accountId: env.HOUSE_ID, keyPair: parseSecretKey(env.HOUSE_PRIVATE_KEY), rpc });
    const probe = env.TEE_PROBE === 'off' ? Promise.resolve() : keepTeeHealthFresh(env, rpc, house).catch(() => undefined);
    const stale = await findStale(env, idleMs);
    for (const s of stale) {
      const args = new TextEncoder().encode(JSON.stringify({ season_id: s.seasonId }));
      const r = await house.send(env.CONTRACT_ID, [{ kind: 'functionCall', method: 'close_season', args, gas: 100n * 10n ** 12n, deposit: 0n }]);
      // Closed on-chain, or already closed/confessed there: either way the session is finished.
      const done = r.ok || r.errorCode === 'E_CLOSED';
      if (done) {
        await env.DB.prepare(`UPDATE sessions SET state = json_set(state, '$.phase', 'closed') WHERE id = ?1`).bind(s.id).run();
      }
    }
    await probe;
  },
};
