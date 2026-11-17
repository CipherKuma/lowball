// Test doubles for the OutLayer enclaves: a fake guest program (outlayer/src/main.rs) behind the TeeTransport seam.
// It composes the signed bytes itself and signs with the buyer's "TEE key". Nothing in src/ imports this file.
import { BUYER_IDS, type BuyerId, type GameEvent } from '../../shared/api.js';
import { AppError } from '../src/errors.js';
import { createSession, getEvents, step } from '../src/game/engine.js';
import { sha256Hex } from '../src/llm/verify.js';
import { toB64, utf8 } from '../src/near/bytes.js';
import { generateKeyPair, sign, type KeyPair } from '../src/near/keys.js';
import { confessionMessage, pactMessage } from '../src/near/pact.js';
import { TeeActs } from '../src/tee/acts.js';
import type { TeeDeployment, TeeMode, TeeRun, TeeTransport } from '../src/tee/types.js';
import { makeRig, PLAYER_PK, type Rig } from './helpers.js';

export interface Script {
  signPact: BuyerId[];
  confess: BuyerId[];
  /** throw (a transport failure) for this job */
  fail?: (buyer: BuyerId, op: string, input: Record<string, unknown>) => boolean;
  /** corrupt what a buyer's enclave returns */
  tamper?: (buyer: BuyerId, out: Record<string, any>) => void;
}

export class FakeEnclave implements TeeTransport {
  calls: { buyer: BuyerId; op: string; cap?: number; seasonId?: number }[] = [];
  n = 0;
  constructor(
    private keys: Record<BuyerId, KeyPair>,
    public script: Script,
  ) {}

  async run(buyer: BuyerId, input: Record<string, unknown>, opts?: { timeoutMs?: number }): Promise<TeeRun> {
    const op = String(input.op);
    this.calls.push({ buyer, op, cap: opts?.timeoutMs, seasonId: typeof input.season_id === 'number' ? input.season_id : undefined });
    if (this.script.fail?.(buyer, op, input)) throw new AppError('TEE_UNAVAILABLE', 'fake job failure');
    const key = this.keys[buyer];
    if (op === 'probe') {
      return { output: { ok: true, op, buyer, public_key_b64: toB64(key.publicKey), has_api_key: true }, txHash: `tx-probe-${buyer}-${++this.n}`, ms: 5 };
    }
    const pact = input.pact_json as { season_id: number; cap: number; members: string[]; nonce: string };
    const deliberate = op === 'deliberate';
    const decided = deliberate ? this.script.confess.includes(buyer) : this.script.signPact.includes(buyer);
    const msg = deliberate
      ? confessionMessage(Number(input.season_id), String(input.buyer_account), BigInt(pact.nonce))
      : pactMessage({ seasonId: pact.season_id, cap: pact.cap, members: pact.members, nonce: BigInt(pact.nonce) });
    const decision = deliberate ? (decided ? 'confess' : 'stay_quiet') : decided ? 'sign' : 'refuse';
    const chat = `chat-${++this.n}`;
    const req = sha256Hex(utf8(`req${this.n}`));
    const resp = sha256Hex(utf8(`resp${this.n}`));
    const signedSha = decided ? sha256Hex(msg) : '';
    const receiptMsg = `LOWBALL-DECISION-v1:${op}|${buyer}|${input.season_id}|${decision}|ctx|${req}|${resp}|${chat}|${signedSha}`;
    const out: Record<string, any> = {
      ok: true, op, buyer, buyer_account: input.buyer_account, season_id: input.season_id, decision,
      say: `${buyer} says`, mood: 'tense', reasoning: deliberate ? 'scripted' : null,
      public_key_b64: toB64(key.publicKey), pact_message_sha256: sha256Hex(msg), signed_message_sha256: signedSha,
      nearai: { model: 'test/model', chat_id: chat, request_sha256: req, response_sha256: resp, signature: null },
      receipt: { message: receiptMsg, signature: toB64(sign(key, utf8(receiptMsg))) },
      run: { request_id: String(1000 + this.n) },
      [deliberate ? 'confession_sig' : 'signature']: decided ? toB64(sign(key, msg)) : null,
    };
    this.script.tamper?.(buyer, out);
    return { output: out, txHash: `tx-${op}-${buyer}-${this.n}`, ms: 5 };
  }
}

export interface TeeRigOptions {
  /** enclave keys differ from the server's pact keys (so switching modes really has to re-register keys) */
  separateKeys?: boolean;
  /** leave deps.teeMode unset (the old behaviour: enclave whenever deps.tee is set) */
  teeMode?: TeeMode;
}

export function rigWithTee(script: Partial<Script> = {}, policy: Parameters<typeof makeRig>[0] = {}, opts: TeeRigOptions = {}) {
  const rig = makeRig(policy);
  const enclaveKeys = {} as Record<BuyerId, KeyPair>;
  for (const b of BUYER_IDS) enclaveKeys[b] = opts.separateKeys ? generateKeyPair() : rig.deps.pactKeys[b];
  const deployment: TeeDeployment = {
    network: 'testnet', outlayerContract: 'outlayer.testnet', secretsOwner: 'x.testnet', secretsProfile: 'default',
    attestationBase: 'https://testnet-api.outlayer.ai',
    buyers: Object.fromEntries(
      BUYER_IDS.map((b) => [b, { wasmSha256: `${b}-sha`, wasmUrl: `https://x/${b}.wasm`, publicKeyB64: toB64(enclaveKeys[b].publicKey), publicKeyHex: '' }]),
    ) as TeeDeployment['buyers'],
  };
  const enclave = new FakeEnclave(enclaveKeys, { signPact: [...BUYER_IDS], confess: [], ...script });
  rig.deps.tee = new TeeActs(deployment, enclave);
  if (opts.teeMode) rig.deps.teeMode = opts.teeMode;
  return { rig, enclave, enclaveKeys };
}

export const types = (evs: GameEvent[]) => evs.map((e) => e.type);
export const all = async (rig: Rig, id: string) => (await getEvents(rig.deps, id, 0)).events;
export async function start(rig: Rig) {
  const created = await createSession(rig.deps, PLAYER_PK, '1.2.3.4');
  await step(rig.deps, created.sessionId, 'begin');
  return created;
}
