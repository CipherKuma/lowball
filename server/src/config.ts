import { BUYER_IDS, type BuyerId } from '../../shared/api.js';
import { RealChain } from './chain/real.js';
import type { GameDeps } from './game/ctx.js';
import { NearAiLlm } from './llm/client.js';
import { nearToYocto, parseBuyerKeys } from './near/accounts.js';
import { Rpc, DEFAULT_RPC_URLS } from './near/rpc.js';
import { setDebug } from './log.js';
import { D1Store } from './store/d1.js';
import type { Env } from './env.js';
import generated from './generated/config.json';

export interface Resolved {
  contractId: string;
  houseId: string;
}

export function resolveIds(env: Env): Resolved {
  const contractId = env.CONTRACT_ID || generated.contractId;
  const houseId = env.HOUSE_ACCOUNT_ID || generated.houseAccountId;
  if (!contractId || !houseId) throw new Error('contract and house account ids are not configured (run `npm run sync`)');
  return { contractId, houseId };
}

let cached: { key: string; chain: RealChain; llm: NearAiLlm; pactKeys: GameDeps['pactKeys'] } | null = null;

/** Build the per-request dependency bundle. Chain and LLM clients are cached per isolate. */
export function buildDeps(env: Env): GameDeps {
  setDebug(env.DEBUG);
  const { contractId, houseId } = resolveIds(env);
  const key = [contractId, houseId, env.NEARAI_MODEL, env.RPC_URLS].join('|');
  if (!cached || cached.key !== key) {
    const rpc = new Rpc({ urls: env.RPC_URLS ? env.RPC_URLS.split(',').map((s) => s.trim()) : DEFAULT_RPC_URLS });
    const buyerKeys = parseBuyerKeys(env.BUYER_KEYS_JSON);
    const chain = new RealChain({ rpc, contractId, houseId, houseKey: env.HOUSE_PRIVATE_KEY, buyerKeys });
    const llm = new NearAiLlm({ apiKey: env.NEARAI_API_KEY, model: env.NEARAI_MODEL, baseUrl: env.NEARAI_BASE_URL });
    const pactKeys = {} as Record<BuyerId, (typeof buyerKeys)[BuyerId]['pact']>;
    for (const id of BUYER_IDS) pactKeys[id] = buyerKeys[id].pact;
    cached = { key, chain, llm, pactKeys };
  }
  return {
    store: new D1Store(env.DB),
    chain: cached.chain,
    llm: cached.llm,
    pactKeys: cached.pactKeys,
    config: {
      days: Number(env.SEASON_DAYS ?? 6),
      bondYocto: nearToYocto(env.BOND_NEAR ?? '0.2'),
      minTreasuryYocto: nearToYocto(env.MIN_TREASURY_NEAR ?? '1.5'),
    },
  };
}
