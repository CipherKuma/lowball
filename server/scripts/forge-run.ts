// Real testnet run of the forgery drill. Plays a 2-day season on testnet with the on-chain path real and the buyer
// model SCRIPTED (this run is about the contract's refusals, not model output), closes it, then calls forge().
// Usage: npx tsx scripts/forge-run.ts      Keys come from .dev.vars into the environment and are never printed.
import { readFileSync } from 'node:fs';
import { BUYER_IDS } from '../../shared/api.js';
import { RealChain } from '../src/chain/real.js';
import { forge } from '../src/features/forge.js';
import { createSession, getEvents, step } from '../src/game/engine.js';
import { nearToYocto, parseBuyerKeys } from '../src/near/accounts.js';
import { formatPublicKey, generateKeyPair } from '../src/near/keys.js';
import { MemoryStore } from '../src/store/memory.js';
import { DEFAULT_POLICY, ScriptedLlm } from '../test/helpers.js';
import { setDebug } from '../src/log.js';
import { Rpc, RpcError } from '../src/near/rpc.js';
import { loadDeployed, makeRpc } from './lib.js';

for (const line of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (m) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
}
setDebug(process.env.DEBUG);
// diagnostics only: say which RPC call was rejected and why (never the request body, which holds signed txs)
const rpcCall = Rpc.prototype.call;
Rpc.prototype.call = async function (this: Rpc, method: string, params: unknown) {
  try {
    return await rpcCall.call(this, method, params);
  } catch (e) {
    if (e instanceof RpcError && method === 'send_tx') process.stderr.write(`[send_tx rejected] ${e.name_} ${JSON.stringify(e.raw).slice(0, 400)}\n`);
    throw e;
  }
} as typeof rpcCall;
const { contractId, houseId } = loadDeployed();
const buyerKeys = parseBuyerKeys(process.env.BUYER_KEYS_JSON!);
const chain = new RealChain({ rpc: makeRpc(), contractId, houseId, houseKey: process.env.HOUSE_PRIVATE_KEY!, buyerKeys });
const pactKeys = Object.fromEntries(BUYER_IDS.map((id) => [id, buyerKeys[id].pact])) as never;
const deps = {
  store: new MemoryStore(),
  chain,
  llm: new ScriptedLlm({ ...DEFAULT_POLICY, confess: [] }),
  pactKeys,
  config: { days: 2, bondYocto: nearToYocto('0.05'), minTreasuryYocto: nearToYocto('1') },
};

const explorer = (h: string) => (h ? `https://testnet.nearblocks.io/txns/${h}` : '(no tx)');
const t0 = Date.now();
const c = await createSession(deps, formatPublicKey(generateKeyPair().publicKey), 'forge-run');
await step(deps, c.sessionId, 'begin');
for (let d = 1; d <= 2; d++) {
  await step(deps, c.sessionId, 'sell');
  await step(deps, c.sessionId, 'next_day');
}
const seasonMs = Date.now() - t0;
const state = (await deps.store.loadState(c.sessionId))!;
const t1 = Date.now();
const r = await forge(deps, c.sessionId);
const out = {
  contractId,
  realSeasonId: state.seasonId,
  phase: state.phase,
  seasonSeconds: Math.round(seasonMs / 1000),
  forgeSeconds: Math.round((Date.now() - t1) / 1000),
  drillSeasonId: r.drillSeasonId,
  attempts: r.attempts.map((a) => ({ ...a, explorer: explorer(a.tx) })),
  cleanup: r.cleanupTx ? explorer(r.cleanupTx) : null,
  eventTypes: (await getEvents(deps, c.sessionId, 0)).events.map((e) => e.type).filter((t) => t === 'forgery'),
};
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
