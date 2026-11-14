// Test doubles. Everything here is mock-only: nothing in src/ imports this file.
import { BUYER_IDS, type BuyerId, type Receipt } from '../../shared/api.js';
import { MockChain } from '../src/chain/mock.js';
import type { GameConfig, GameDeps } from '../src/game/ctx.js';
import { formatPublicKey, generateKeyPair, type KeyPair } from '../src/near/keys.js';
import type { CompleteRequest, CompleteResult, Llm } from '../src/llm/types.js';
import { MemoryStore } from '../src/store/memory.js';

export interface Policy {
  /** buyers that choose sign=true in the cartel (default: all five) */
  sign: BuyerId[];
  cap: number;
  bid: (buyer: BuyerId, day: number) => number;
  confess: BuyerId[];
  /** buyers whose model calls throw */
  failFor?: BuyerId[];
}

export const DEFAULT_POLICY: Policy = {
  sign: ['marlow', 'odile', 'sully', 'ines', 'deacon'],
  cap: 60,
  bid: () => 60,
  confess: [],
};

/** A scripted model stand-in for tests. The real NEAR AI client is exercised separately with a recorded transport. */
export class ScriptedLlm implements Llm {
  readonly model = 'test/scripted';
  calls: { buyer: BuyerId; kind: string }[] = [];
  constructor(public policy: Policy = DEFAULT_POLICY) {}

  async complete<T>(req: CompleteRequest<T>): Promise<CompleteResult<T>> {
    this.calls.push({ buyer: req.buyer, kind: req.kind });
    if (this.policy.failFor?.includes(req.buyer)) throw new (await import('../src/errors.js')).AppError('MODEL_UNAVAILABLE');
    const p = this.policy;
    let raw: unknown;
    switch (req.kind) {
      case 'cartel':
        raw = { say: `${req.buyer} speaks`, propose_cap: p.cap, sign: p.sign.includes(req.buyer), mood: 'calm' };
        break;
      case 'bid':
        raw = { amount: p.bid(req.buyer, req.day ?? 0), say: `${req.buyer} bids`, mood: 'cold' };
        break;
      case 'deliberate':
        raw = { confess: p.confess.includes(req.buyer), say: `${req.buyer} answers`, reasoning: 'scripted', mood: 'tense' };
        break;
      default:
        raw = { say: `${req.buyer} mutters`, mood: 'calm' };
    }
    const value = req.schema.parse(raw);
    const chatId = `chatcmpl-test-${this.calls.length}`;
    const receipt: Receipt = {
      chatId, kind: req.kind, buyer: req.buyer, day: req.day, model: this.model, signature: null, output: value,
      createdAt: Date.now() + this.calls.length,
      verification: {
        requestHash: '', responseHash: '', signatureKind: 'unknown', signingAlgo: '', signingAddress: '',
        textMatches: false, signatureValid: false, signerMatchesPreflight: false, quoteVerified: false, verified: false,
        error: 'scripted test transport',
      },
    };
    return { value, chatId, receipt: Promise.resolve(receipt) };
  }
}

export interface Rig {
  deps: GameDeps;
  chain: MockChain;
  store: MemoryStore;
  llm: ScriptedLlm;
}

export const TEST_CONFIG: GameConfig = { days: 3, bondYocto: 200_000_000_000_000_000_000_000n, minTreasuryYocto: 1n, minCaseDays: 0 };

export function makeRig(policy: Partial<Policy> = {}, config: Partial<GameConfig> = {}): Rig {
  const pactKeys = {} as Record<BuyerId, KeyPair>;
  const pubs = {} as Record<BuyerId, Uint8Array>;
  for (const id of BUYER_IDS) {
    pactKeys[id] = generateKeyPair();
    pubs[id] = pactKeys[id].publicKey;
  }
  const chain = new MockChain(pubs);
  const store = new MemoryStore();
  const llm = new ScriptedLlm({ ...DEFAULT_POLICY, ...policy });
  // Time is simulated: every wait between chain polls advances the mock chain by 60 blocks (200 = the yield window).
  const sleep = async () => chain.advanceBlocks(60);
  return { deps: { store, chain, llm, pactKeys, config: { ...TEST_CONFIG, ...config }, sleep, pollMs: 1 }, chain, store, llm };
}

export const PLAYER_PK = formatPublicKey(generateKeyPair().publicKey);
