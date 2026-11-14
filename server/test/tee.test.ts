// TEE_BUYERS=1 against MockChain and a faked OutLayer transport. The fake enclave plays the guest program
// (outlayer/src/main.rs): it composes the signed bytes itself and signs with the buyer's "TEE key" (the key the
// mock chain registered). The real guest and transport are exercised on testnet (research/outlayer-integration.md).
import { describe, expect, it } from 'vitest';
import { BUYER_IDS, type BuyerId, type GameEvent } from '../../shared/api.js';
import { AppError } from '../src/errors.js';
import { casefile, createSession, getEvents, leniency, step } from '../src/game/engine.js';
import { sha256Hex } from '../src/llm/verify.js';
import { toB64, utf8 } from '../src/near/bytes.js';
import { sign } from '../src/near/keys.js';
import { confessionMessage, pactMessage } from '../src/near/pact.js';
import { TeeActs } from '../src/tee/acts.js';
import type { TeeDeployment, TeeRun, TeeTransport } from '../src/tee/types.js';
import { makeRig, PLAYER_PK, type Rig } from './helpers.js';

interface Script {
  signPact: BuyerId[];
  confess: BuyerId[];
  fail?: (buyer: BuyerId, op: string) => boolean;
  /** corrupt what a buyer's enclave returns */
  tamper?: (buyer: BuyerId, out: Record<string, any>) => void;
}

class FakeEnclave implements TeeTransport {
  calls: { buyer: BuyerId; op: string }[] = [];
  n = 0;
  constructor(
    private rig: Rig,
    public script: Script,
  ) {}

  async run(buyer: BuyerId, input: Record<string, unknown>): Promise<TeeRun> {
    const op = String(input.op);
    this.calls.push({ buyer, op });
    if (this.script.fail?.(buyer, op)) throw new AppError('TEE_UNAVAILABLE', 'fake job failure');
    const key = this.rig.deps.pactKeys[buyer];
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

function rigWithTee(script: Partial<Script> = {}, policy: Parameters<typeof makeRig>[0] = {}) {
  const rig = makeRig(policy);
  const deployment: TeeDeployment = {
    network: 'testnet', outlayerContract: 'outlayer.testnet', secretsOwner: 'x.testnet', secretsProfile: 'default',
    attestationBase: 'https://testnet-api.outlayer.ai',
    buyers: Object.fromEntries(
      BUYER_IDS.map((b) => [b, { wasmSha256: `${b}-sha`, wasmUrl: `https://x/${b}.wasm`, publicKeyB64: toB64(rig.deps.pactKeys[b].publicKey), publicKeyHex: '' }]),
    ) as TeeDeployment['buyers'],
  };
  const enclave = new FakeEnclave(rig, { signPact: [...BUYER_IDS], confess: [], ...script });
  rig.deps.tee = new TeeActs(deployment, enclave);
  return { rig, enclave };
}

const types = (evs: GameEvent[]) => evs.map((e) => e.type);
const all = async (rig: Rig, id: string) => (await getEvents(rig.deps, id, 0)).events;
async function start(rig: Rig) {
  const created = await createSession(rig.deps, PLAYER_PK, '1.2.3.4');
  await step(rig.deps, created.sessionId, 'begin');
  return created;
}

describe('TEE_BUYERS=1', () => {
  it('pact and confession come from five enclave jobs each; the server signs nothing; the contract accepts it', async () => {
    const { rig, enclave } = rigWithTee({ confess: ['sully', 'ines'] });
    const { sessionId, playerAccountId } = await start(rig);
    expect(enclave.calls.filter((c) => c.op === 'sign_pact')).toHaveLength(5);
    // no server-side round-2 cartel call: the scripted model only did round 1
    expect(rig.llm.calls.filter((c) => c.kind === 'cartel')).toHaveLength(5);
    const tx = rig.chain.playerOffersLeniency(0, playerAccountId);
    const r = await leniency(rig.deps, sessionId, tx.hash);
    expect(['sully', 'ines']).toContain(r.confessor);
    expect(enclave.calls.filter((c) => c.op === 'deliberate')).toHaveLength(5);
    expect(rig.llm.calls.filter((c) => c.kind === 'deliberate')).toHaveLength(0);
    const evs = await all(rig, sessionId);
    const tee = evs.filter((e) => e.type === 'tee_signed') as Extract<GameEvent, { type: 'tee_signed' }>[];
    expect(tee.filter((e) => e.act === 'pact')).toHaveLength(5);
    expect(tee.filter((e) => e.act === 'confession')).toHaveLength(5);
    expect(tee[0]).toMatchObject({ attestationUrl: expect.stringContaining('/attestations/by-tx/tx-sign_pact-'), wasmSha256: expect.stringMatching(/-sha$/) });
    const view = await rig.chain.getSeason(0);
    expect(view.first_confessor).toBe(`${r.confessor}.${rig.chain.houseId}`);
    expect(view.verified_signers).toHaveLength(5);
    // the case file lists every enclave act with its evidence
    expect((await rig.store.loadState(sessionId))!.phase).toBe('closed');
    const cf = await casefile(rig.deps, sessionId);
    expect(cf.tee).toHaveLength(10);
    expect(cf.tee![0]).toMatchObject({ signatureVerified: true, publicKeyB64: expect.any(String) });
  });

  it('a buyer who refuses has no signature and does not deliberate; two signers still make a pact', async () => {
    const { rig, enclave } = rigWithTee({ signPact: ['marlow', 'odile'], confess: ['marlow'] });
    const { sessionId, playerAccountId } = await start(rig);
    const s = (await rig.store.loadState(sessionId))!;
    expect(s.pact!.members).toEqual(['marlow', 'odile']);
    expect(s.pact!.signatures).toHaveLength(2);
    expect(s.pact!.memberAccounts).toHaveLength(5);
    const r = await leniency(rig.deps, sessionId, rig.chain.playerOffersLeniency(0, playerAccountId).hash);
    expect(r.confessor).toBe('marlow');
    expect(enclave.calls.filter((c) => c.op === 'deliberate').map((c) => c.buyer).sort()).toEqual(['marlow', 'odile']);
  });

  it('fewer than two signers: no pact, no deliberation jobs, holdout no_pact', async () => {
    const { rig, enclave } = rigWithTee({ signPact: ['marlow'] });
    const { sessionId, playerAccountId } = await start(rig);
    const r = await leniency(rig.deps, sessionId, rig.chain.playerOffersLeniency(0, playerAccountId).hash);
    expect(r.confessor).toBeNull();
    expect(enclave.calls.filter((c) => c.op === 'deliberate')).toHaveLength(0);
    expect(types(await all(rig, sessionId))).toContain('holdout');
  });

  it('a failed job reports TEE_UNAVAILABLE (retryable), never falls back to a server key, and begin can be retried', async () => {
    let failing = true;
    const { rig, enclave } = rigWithTee({ fail: (b) => failing && b === 'deacon' });
    const created = await createSession(rig.deps, PLAYER_PK, '1.2.3.4');
    await expect(step(rig.deps, created.sessionId, 'begin')).rejects.toMatchObject({ code: 'TEE_UNAVAILABLE' });
    const evs = await all(rig, created.sessionId);
    expect(evs.filter((e) => e.type === 'error' && (e as any).code === 'TEE_UNAVAILABLE' && (e as any).retryable)).not.toHaveLength(0);
    expect((await rig.store.loadState(created.sessionId))!.pact).toBeNull();
    failing = false;
    await step(rig.deps, created.sessionId, 'begin');
    const s = (await rig.store.loadState(created.sessionId))!;
    expect(s.pact!.members).toHaveLength(5);
    // the retry kept round 1 instead of asking the model again
    expect(rig.llm.calls.filter((c) => c.kind === 'cartel')).toHaveLength(5);
    expect(s.channel.filter((m) => m.round === 1)).toHaveLength(5);
    expect(enclave.calls.filter((c) => c.op === 'sign_pact').length).toBeGreaterThanOrEqual(10);
  });

  it('one retry per job: a transient failure or an empty result is absorbed and counted; two in a row fail the job', async () => {
    const seen = new Set<string>();
    const { rig, enclave } = rigWithTee({ fail: (b, op) => b === 'ines' && !seen.has(op) && !!seen.add(op) });
    const created = await createSession(rig.deps, PLAYER_PK, '1.2.3.4');
    await step(rig.deps, created.sessionId, 'begin');
    expect((await rig.store.loadState(created.sessionId))!.pact!.members).toHaveLength(5);
    expect(enclave.calls.filter((c) => c.buyer === 'ines')).toHaveLength(2);
    const stats = rig.deps.tee!.stats;
    expect(stats).toMatchObject({ jobs: 5, failedAttempts: 1, failedJobs: 0 });
    const records = await rig.store.listArtifacts<{ buyer: string; attempts: number }>(created.sessionId, 'tee');
    expect(records.find((r) => r.buyer === 'ines')!.attempts).toBe(2);
    expect(records.find((r) => r.buyer === 'odile')!.attempts).toBe(1);
  });

  it.each([
    ['a signature from another key', (_b: BuyerId, o: Record<string, any>) => { o.signature = toB64(new Uint8Array(64).fill(7)); }],
    ['an enclave that is not the registered key', (_b: BuyerId, o: Record<string, any>) => { o.public_key_b64 = toB64(new Uint8Array(32).fill(1)); }],
    ['a decision that disagrees with the signature', (_b: BuyerId, o: Record<string, any>) => { o.decision = 'refuse'; }],
    ['a forged receipt', (_b: BuyerId, o: Record<string, any>) => { o.receipt.message += 'x'; }],
    ['a guest failure', (_b: BuyerId, o: Record<string, any>) => { for (const k of Object.keys(o)) delete o[k]; o.ok = false; o.error = 'caller not allowed'; }],
  ])('refuses %s from an enclave', async (_n, tamper) => {
    const { rig } = rigWithTee({ tamper: (b, o) => b === 'ines' && tamper(b, o) });
    const created = await createSession(rig.deps, PLAYER_PK, '1.2.3.4');
    await expect(step(rig.deps, created.sessionId, 'begin')).rejects.toMatchObject({ code: 'TEE_UNAVAILABLE' });
    expect((await rig.store.loadState(created.sessionId))!.pact).toBeNull();
  });
});
