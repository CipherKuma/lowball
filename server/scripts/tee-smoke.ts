// Real OutLayer jobs for all five buyers, no game and no contract: sign_pact on a synthetic pact, then deliberate
// for the buyers that signed. Checks every output the way the Worker does (registered key, signature, receipt).
//   npm run tee-smoke        (needs ~/.near-credentials/testnet/lowball-house-ck.testnet.json)
import { BUYER_IDS, type BuyerId } from '../../shared/api.js';
import { GameCtx } from '../src/game/ctx.js';
import type { SessionState } from '../src/game/state.js';
import { randomNonce } from '../src/near/pact.js';
import { NearSigner } from '../src/near/signer.js';
import { MemoryStore } from '../src/store/memory.js';
import { TeeActs } from '../src/tee/acts.js';
import { OutlayerTransport } from '../src/tee/outlayer.js';
import type { TeeDeployment } from '../src/tee/types.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, loadDeployed, loadNearCredential, makeRpc } from './lib.js';

const out = (s: string) => process.stdout.write(s + '\n');
const deployment = JSON.parse(readFileSync(join(REPO, 'outlayer/deployed.json'), 'utf8')) as TeeDeployment;
const { houseId } = loadDeployed();
const rpc = makeRpc();
const signer = new NearSigner({ accountId: houseId, keyPair: loadNearCredential(houseId), rpc });
const tee = new TeeActs(deployment, new OutlayerTransport({ deployment, signer, rpc }));
const store = new MemoryStore();
const ctx = new GameCtx('smoke', { seq: 0 } as SessionState, { store } as never);
const acct = (b: BuyerId) => `${b}.${houseId}`;
const pact = { season_id: 1, cap: 40, members: BUYER_IDS.map(acct), nonce: randomNonce().toString() };
const system = (b: BuyerId) => `You are ${b}, one of five fish buyers on Pier Nine. Reply with JSON only.`;

const t0 = Date.now();
const votes = await Promise.allSettled(
  BUYER_IDS.map(async (b) => {
    const v = await tee.signPact(ctx, b, {
      seasonId: 1, buyerAccount: acct(b), pact, system: system(b),
      user: 'PRIVATE CHANNEL. The ring proposes a pact: every member bids exactly 40 marks. Members are those who sign; a member who later talks to the fisher gets their bond back and the rest lose theirs. Decide whether you sign.',
    });
    out(`sign_pact ${b}: ${v.sign ? 'SIGN' : 'refuse'} sig=${v.signatureB64?.slice(0, 10) ?? '-'} "${v.say.slice(0, 60)}"`);
    return { b, v };
  }),
);
out(`sign_pact batch: ${Math.round((Date.now() - t0) / 1000)} s`);
const signers = votes.flatMap((r) => (r.status === 'fulfilled' && r.value.v.sign ? [r.value] : []));
for (const r of votes) if (r.status === 'rejected') out(`FAILED sign_pact: ${String(r.reason)}`);
const t1 = Date.now();
const dels = await Promise.allSettled(
  signers.map(async ({ b, v }) => {
    const d = await tee.deliberate(ctx, b, {
      seasonId: 1, buyerAccount: acct(b), pact, myPactSignature: v.signatureB64!, system: system(b),
      user: 'The fisher has just offered leniency. Confess first and you keep your bond; stay quiet while another confesses and you lose it. Decide: confess (true) or stay quiet (false).',
    });
    out(`deliberate ${b}: ${d.confess ? 'CONFESS' : 'stay quiet'} confession_sig=${d.confessionSigB64?.slice(0, 10) ?? '-'}`);
  }),
);
out(`deliberate batch: ${Math.round((Date.now() - t1) / 1000)} s`);
for (const r of dels) if (r.status === 'rejected') out(`FAILED deliberate: ${String(r.reason)}`);
const acts = await store.listArtifacts<Record<string, unknown>>('smoke', 'tee');
for (const a of acts) out(`${a.act} ${a.buyer} ${a.decision} tx=${a.txHash} job=${a.jobId} ${Math.round(Number(a.ms) / 1000)}s verified=${a.signatureVerified} nearai=${JSON.stringify(a.nearAi && { kind: (a.nearAi as any).signatureKind, text: (a.nearAi as any).textMatches, sig: (a.nearAi as any).signatureValid })}`);
