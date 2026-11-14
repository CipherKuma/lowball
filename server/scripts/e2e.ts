// End-to-end season against NEAR testnet; offers leniency once two identical-bid days are on record, from the player's own key.
//   HTTP mode (real NEAR AI, real Worker):  npm run e2e -- --base http://localhost:8787 [--payout-evm 0x...]
//   In-process (real chain, SCRIPTED model; chain-path check only, never a model result):
//                                            npm run e2e -- --in-process
// Writes E2E-RUN.result.md (HTTP) or E2E-RUN.in-process.md with every tx hash; E2E-RUN.md holds the steps.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CasefileResponse, CreateSessionResponse, EventsResponse, GameEvent, LeniencyResponse, StepAction, StepResponse } from '../../shared/api.js';
import { RealChain } from '../src/chain/real.js';
import { EvmRpc, relayPayout } from '../src/chainsig/index.js';
import { formatPublicKey, formatSecretKey, generateKeyPair, parseSecretKey } from '../src/near/keys.js';
import { NearSigner } from '../src/near/signer.js';
import { parseBuyerKeys, nearToYocto } from '../src/near/accounts.js';
import { casefile, createSession, getEvents, leniency, step } from '../src/game/engine.js';
import { MemoryStore } from '../src/store/memory.js';
import { ScriptedLlm, DEFAULT_POLICY } from '../test/helpers.js';
import { BUYER_IDS } from '../../shared/api.js';
import { SECRETS_DIR, loadDeployed, loadNearCredential, makeRpc } from './lib.js';

interface Api {
  create(pk: string, payoutEvm?: string): Promise<CreateSessionResponse>;
  step(id: string, a: StepAction): Promise<StepResponse>;
  events(id: string, after: number): Promise<EventsResponse>;
  leniency(id: string, tx: string): Promise<LeniencyResponse>;
  casefile(id: string): Promise<CasefileResponse>;
  model: string;
}

const out = (s: string) => process.stdout.write(s + '\n');
const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? (process.argv[i + 1] ?? '') : undefined;
};

function httpApi(base: string): Api {
  const j = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const r = await fetch(base + path, init);
    const body = (await r.json()) as T & { error?: string; code?: string };
    if (!r.ok) throw new Error(`${path} -> ${r.status} ${body.code}: ${body.error}`);
    return body;
  };
  const post = (path: string, b: unknown) => j<any>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  return {
    model: 'whatever the Worker is configured with (see casefile.model)',
    create: (pk, payoutEvm) => post('/api/session', { playerPublicKey: pk, ...(payoutEvm ? { payoutEvm } : {}) }),
    step: (id, action) => post(`/api/session/${id}/step`, { action }),
    events: (id, after) => j(`/api/session/${id}/events?after=${after}`),
    leniency: (id, txHash) => post(`/api/session/${id}/leniency`, { txHash }),
    casefile: (id) => j(`/api/session/${id}/casefile`),
  };
}

function inProcessApi(): Api {
  const { contractId, houseId } = loadDeployed();
  const rpc = makeRpc();
  const buyerKeys = parseBuyerKeys(readFileSync(join(SECRETS_DIR, `${contractId}.json`), 'utf8'));
  const chain = new RealChain({ rpc, contractId, houseId, houseKey: formatSecretKey(loadNearCredential(houseId)), buyerKeys });
  const pactKeys = Object.fromEntries(BUYER_IDS.map((id) => [id, buyerKeys[id].pact])) as never;
  // Day 2 confession is the point of the run: Sully and Ines are scripted to confess.
  const llm = new ScriptedLlm({ ...DEFAULT_POLICY, confess: ['sully', 'ines'] });
  const evm = new EvmRpc({ urls: process.env.SEPOLIA_RPC_URLS?.split(',') });
  const payout = { relay: (seasonId: number, o: { waitSignedMs: number; waitReceiptMs: number }) => relayPayout(seasonId, { near: rpc, evm, deskId: process.env.DESK_ACCOUNT_ID ?? `desk.${contractId}`, ...o }) };
  const deps = { store: new MemoryStore(), chain, llm, pactKeys, payout, config: { days: 4, bondYocto: nearToYocto('0.2'), minTreasuryYocto: nearToYocto('1') } };
  return {
    model: 'SCRIPTED (test double): the on-chain path is real, the buyer decisions are not model output',
    create: (pk, payoutEvm) => createSession(deps, pk, 'e2e', payoutEvm),
    step: (id, a) => step(deps, id, a),
    events: (id, after) => getEvents(deps, id, after),
    leniency: (id, tx) => leniency(deps, id, tx),
    casefile: (id) => casefile(deps, id),
  };
}

const explorer = (h: string) => `https://testnet.nearblocks.io/txns/${h}`;

async function main() {
  const inProcess = process.argv.includes('--in-process');
  const base = arg('--base') ?? 'http://localhost:8787';
  const api = inProcess ? inProcessApi() : httpApi(base);
  const { contractId } = loadDeployed();
  const playerKey = generateKeyPair();
  const t0 = Date.now();
  const seen: GameEvent[] = [];
  let after = 0;
  const drain = async (id: string) => {
    const r = await api.events(id, after);
    for (const e of r.events) {
      seen.push(e);
      after = e.seq;
      const extra =
        e.type === 'line' ? ` ${e.buyer}: ${e.text}`
        : e.type === 'lot_minted' ? ` ${e.tokenId} x${e.amount}kg`
        : e.type === 'lot_transferred' ? ` ${e.tokenId} -> ${e.to} (${e.memo ?? ''})`
        : e.type === 'leniency_open' ? ` deadline block ${e.deadlineBlock}`
        : e.type === 'holdout' ? ` reason ${e.reason}`
        : e.type === 'payout_evm' ? ` ${e.amountWei} wei -> ${e.to} sepolia ${e.sepoliaTx} (${e.status})`
        : e.type === 'error' ? ` ${e.code}: ${e.message}`
        : '';
      out(`  [${e.seq}] ${e.type}${'tx' in e && e.tx ? ' ' + e.tx.slice(0, 10) + '..' : ''}${extra}`);
    }
    return r.status;
  };

  const payoutEvm = arg('--payout-evm');
  const session = await api.create(formatPublicKey(playerKey.publicKey), payoutEvm);
  out(`session ${session.sessionId} player ${session.playerAccountId} contract ${session.contractId}`);
  await drain(session.sessionId);
  const id = session.sessionId;
  const run = async (a: StepAction) => {
    out(`step ${a}`);
    await api.step(id, a);
    return drain(id);
  };

  await run('begin');
  // Leniency needs a case on the record: two settled days with identical bids (the server refuses it earlier).
  const identicalDays = () => seen.filter((e) => e.type === 'bids_revealed' && e.identical).length;
  for (let d = 1; d < 5; d++) {
    await run('sell');
    if (identicalDays() >= 2) break;
    await run('next_day');
  }
  if (identicalDays() < 2) throw new Error('the buyers did not bid identically on two days, so leniency is not available');
  await run('next_day');

  // The player signs offer_leniency with their own function-call key, exactly as the browser does.
  const rpc = makeRpc();
  const seasonId = (await drain(id)).seasonId!;
  const player = new NearSigner({ accountId: session.playerAccountId, keyPair: parseSecretKey(formatSecretKey(playerKey)), rpc });
  // offer_leniency is a pending NEP-519 yield: wait for inclusion only (executed would hang until the timeout)
  const offer = await player.send(
    contractId,
    [{ kind: 'functionCall', method: 'offer_leniency', args: new TextEncoder().encode(JSON.stringify({ season_id: seasonId })), gas: 30n * 10n ** 12n, deposit: 0n }],
    'INCLUDED',
  );
  out(`offer_leniency included ok=${offer.ok} tx ${offer.hash}`);
  if (!offer.ok) throw new Error(`offer_leniency failed: ${offer.errorCode}`);
  const res = await api.leniency(id, offer.hash);
  await drain(id);
  out(`leniency result: confessor=${res.confessor} phase=${res.status.phase} finalizing=${res.status.finalizing}`);

  // The 200-block window (holdout) and the cross-chain payout resolve on-chain, possibly after the request
  // returned: keep polling events (that is what resumes them) until the server says nothing is pending.
  let status = res.status;
  for (let i = 0; status.finalizing && i < 150; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    status = await drain(id);
  }
  if (status.finalizing) throw new Error('the leniency window or payout did not resolve in 5 minutes');
  for (let guard = 0; status.phase !== 'closed' && guard < 40; guard++) {
    status = await run(status.phase === 'settled' ? 'next_day' : 'sell');
  }
  if (status.phase !== 'closed') throw new Error('season did not close');
  const cf = await api.casefile(id);

  const lines = [
    `# E2E run (${inProcess ? 'in-process: real NEAR testnet, SCRIPTED buyers' : 'HTTP: Worker + real NEAR AI + real NEAR testnet'})`,
    '',
    `- date: ${new Date().toISOString()}, duration ${Math.round((Date.now() - t0) / 1000)}s`,
    `- contract: \`${cf.contractId}\`, season ${cf.seasonId}, player \`${cf.playerAccountId}\``,
    `- buyer decisions: ${api.model}`,
    `- leniency offered by the player key after two identical-bid days; confessor: **${res.confessor ?? 'nobody (holdout)'}**`,
    `- payout address: ${payoutEvm ?? 'none (NEAR payout)'}`,
    `- pact: ${cf.pact ? `cap ${cf.pact.cap}, members ${cf.pact.members.length}` : 'none formed'}`,
    `- NEAR AI receipts: ${cf.receipts.length}, verified ${cf.receipts.filter((r) => r.verification.verified).length}`,
    '',
    '## Transactions',
    '',
    '| label | signer | ok | hash |',
    '|---|---|---|---|',
    ...cf.txs.map((t) => `| ${t.label} | ${t.signer} | ${t.ok ? 'yes' : `no (${t.errorCode})`} | [${t.hash}](${explorer(t.hash)}) |`),
    `| offer_leniency (browser-signed) | ${cf.playerAccountId} | ${offer.ok ? 'yes' : 'no'} | [${offer.hash}](${explorer(offer.hash)}) |`,
    ...(cf.tee
      ? [
          '',
          '## Acts signed inside OutLayer TDX enclaves',
          '',
          '| act | buyer | decision | job | request tx | ms | NEAR AI sig (text/ecdsa) | attestation |',
          '|---|---|---|---|---|---|---|---|',
          ...cf.tee.map(
            (t) => `| ${t.act} | ${t.buyer} | ${t.decision} | ${t.jobId} | [${t.txHash}](${explorer(t.txHash)}) | ${t.ms} | ${t.nearAi ? `${t.nearAi.textMatches}/${t.nearAi.signatureValid}` : 'n/a'} | ${t.attestationUrl} |`,
          ),
        ]
      : []),
    '',
    '## Event types in order',
    '',
    '```',
    seen.map((e) => `${e.seq} ${e.type}`).join('\n'),
    '```',
    '',
    '## Final on-chain season',
    '',
    '```json',
    JSON.stringify(cf.chain, null, 2),
    '```',
    '',
  ];
  const file = arg('--out') ?? (inProcess ? 'E2E-RUN.in-process.md' : 'E2E-RUN.result.md');
  writeFileSync(new URL(`../${file}`, import.meta.url), lines.join('\n'));
  out(`wrote server/${file}`);
}

main().catch((e) => {
  process.stderr.write(`e2e failed: ${(e as Error).message}\n`);
  process.exit(1);
});
