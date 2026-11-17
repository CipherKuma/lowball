import { BUYER_IDS, type BuyerId } from '../../shared/api.js';
import { RealChain } from './chain/real.js';
import { EvmRpc, checkPayoutAddress, relayPayout } from './chainsig/index.js';
import type { GameDeps, PayoutRelay } from './game/ctx.js';
import { NearAiLlm } from './llm/client.js';
import { costUsd, DEFAULT_NEARAI_BUDGET_USD, DEFAULT_TTS_MAX_PER_SESSION } from './pricing.js';
import type { Store } from './store/types.js';
import { nearToYocto, parseBuyerKeys } from './near/accounts.js';
import { Rpc, DEFAULT_RPC_URLS } from './near/rpc.js';
import { setDebug } from './log.js';
import { D1Store } from './store/d1.js';
import type { Env } from './env.js';
import generated from './generated/config.json';
import deployedTee from '../../outlayer/deployed.json';
import { NearSigner } from './near/signer.js';
import { parseSecretKey } from './near/keys.js';
import { TeeActs } from './tee/acts.js';
import { depositYocto, OutlayerTransport } from './tee/outlayer.js';
import type { TeeDeployment, TeeMode } from './tee/types.js';

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

let cached: { key: string; chain: RealChain; llm: NearAiLlm; pactKeys: GameDeps['pactKeys']; payout: PayoutRelay; tee?: TeeActs } | null = null;
/** the spend ledger the cached LLM client writes to (D1 binding of the current request) */
let ledger: Store | null = null;

/** TEE_MODE = auto | on | off (default auto). The legacy TEE_BUYERS "1"/"0" still maps to on/off when TEE_MODE is unset. */
export function teeModeOf(env: Env): TeeMode {
  const m = (env.TEE_MODE ?? '').trim().toLowerCase();
  if (m === 'auto' || m === 'on' || m === 'off') return m;
  if (env.TEE_BUYERS === '1') return 'on';
  if (env.TEE_BUYERS === '0') return 'off';
  return 'auto';
}

export function ttsMaxPerSession(env: Env): number {
  const n = Number(env.TTS_MAX_PER_SESSION ?? DEFAULT_TTS_MAX_PER_SESSION);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TTS_MAX_PER_SESSION;
}

/** Build the per-request dependency bundle. Chain and LLM clients are cached per isolate. */
export function buildDeps(env: Env): GameDeps {
  setDebug(env.DEBUG);
  const { contractId, houseId } = resolveIds(env);
  const key = [contractId, houseId, env.NEARAI_MODEL, env.RPC_URLS, env.DESK_ACCOUNT_ID, env.SEPOLIA_RPC_URLS, env.TEE_MODE, env.TEE_BUYERS, env.OUTLAYER_DEPOSIT_NEAR].join('|');
  const store = new D1Store(env.DB);
  ledger = store;
  if (!cached || cached.key !== key) {
    const rpc = new Rpc({ urls: env.RPC_URLS ? env.RPC_URLS.split(',').map((s) => s.trim()) : DEFAULT_RPC_URLS });
    const buyerKeys = parseBuyerKeys(env.BUYER_KEYS_JSON);
    const chain = new RealChain({ rpc, contractId, houseId, houseKey: env.HOUSE_PRIVATE_KEY, buyerKeys });
    const llm = new NearAiLlm({
      apiKey: env.NEARAI_API_KEY,
      model: env.NEARAI_MODEL,
      baseUrl: env.NEARAI_BASE_URL,
      // every completion is priced from the model catalogue and written to D1; POST /api/session reads the sum
      onUsage: (u) => ledger?.addSpend({ model: u.model, promptTokens: u.promptTokens, completionTokens: u.completionTokens, usd: costUsd(u.model, u.promptTokens, u.completionTokens) }),
    });
    const evm = new EvmRpc({ urls: env.SEPOLIA_RPC_URLS ? env.SEPOLIA_RPC_URLS.split(',').map((s) => s.trim()) : undefined });
    const deskId = env.DESK_ACCOUNT_ID || `desk.${contractId}`;
    const payout: PayoutRelay = {
      check: (to) => checkPayoutAddress(to, { near: rpc, evm, deskId }),
      relay: (seasonId, o) => relayPayout(seasonId, { near: rpc, evm, deskId, waitSignedMs: o.waitSignedMs, waitReceiptMs: o.waitReceiptMs }),
    };
    const pactKeys = {} as Record<BuyerId, (typeof buyerKeys)[BuyerId]['pact']>;
    for (const id of BUYER_IDS) pactKeys[id] = buyerKeys[id].pact;
    // The enclave client exists unless TEE_MODE=off; each season then picks enclave or standard signing itself
    // (src/tee/mode.ts) and registers the matching keys before create_season.
    let tee: TeeActs | undefined;
    if (teeModeOf(env) !== 'off') {
      const deployment = deployedTee as unknown as TeeDeployment;
      const signer = new NearSigner({ accountId: houseId, keyPair: parseSecretKey(env.HOUSE_PRIVATE_KEY), rpc });
      tee = new TeeActs(deployment, new OutlayerTransport({ deployment, signer, rpc, depositYocto: depositYocto(env.OUTLAYER_DEPOSIT_NEAR) }));
    }
    cached = { key, chain, llm, pactKeys, payout, tee };
  }
  return {
    store,
    chain: cached.chain,
    llm: cached.llm,
    pactKeys: cached.pactKeys,
    payout: cached.payout,
    tee: cached.tee,
    teeMode: teeModeOf(env),
    features: { seaFetch: (...a) => fetch(...a) },
    config: {
      days: Number(env.SEASON_DAYS ?? 6),
      bondYocto: nearToYocto(env.BOND_NEAR ?? '0.2'),
      minTreasuryYocto: nearToYocto(env.MIN_TREASURY_NEAR ?? '1.5'),
      nearAiBudgetUsd: Number.isFinite(Number(env.NEARAI_BUDGET_USD ?? DEFAULT_NEARAI_BUDGET_USD)) ? Number(env.NEARAI_BUDGET_USD ?? DEFAULT_NEARAI_BUDGET_USD) : DEFAULT_NEARAI_BUDGET_USD,
    },
  };
}
