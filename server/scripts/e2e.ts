// End-to-end season against NEAR testnet; offers leniency on day 2 from the player's own key.
//   HTTP mode (real NEAR AI, real Worker):  npm run e2e -- --base http://localhost:8787
//   In-process (real chain, SCRIPTED model; chain-path check only, never a model result):
//                                            npm run e2e -- --in-process
// Writes ../E2E-RUN.md (or E2E-RUN.<mode>.md) with every tx hash.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CasefileResponse, CreateSessionResponse, EventsResponse, GameEvent, LeniencyResponse, StepAction, StepResponse } from '../../shared/api.js';
import { RealChain } from '../src/chain/real.js';
import { formatPublicKey, formatSecretKey, generateKeyPair, parseSecretKey } from '../src/near/keys.js';
import { NearSigner } from '../src/near/signer.js';
import { parseBuyerKeys, nearToYocto } from '../src/near/accounts.js';
import { casefile, createSession, getEvents, leniency, step } from '../src/game/engine.js';
import { MemoryStore } from '../src/store/memory.js';
import { ScriptedLlm, DEFAULT_POLICY } from '../test/helpers.js';
import { BUYER_IDS } from '../../shared/api.js';
import { SECRETS_DIR, loadDeployed, loadNearCredential, makeRpc } from './lib.js';

interface Api {
  create(pk: string): Promise<CreateSessionResponse>;
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
    create: (pk) => post('/api/session', { playerPublicKey: pk }),
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
  const deps = { store: new MemoryStore(), chain, llm, pactKeys, config: { days: 4, bondYocto: nearToYocto('0.2'), minTreasuryYocto: nearToYocto('1') } };
  return {
    model: 'SCRIPTED (test double): the on-chain path is real, the buyer decisions are not model output',
    create: (pk) => createSession(deps, pk, 'e2e'),
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
      out(`  [${e.seq}] ${e.type}${'tx' in e && e.tx ? ' ' + e.tx.slice(0, 10) + '..' : ''}${e.type === 'line' ? ` ${e.buyer}: ${e.text}` : ''}`);
    }
    return r.status;
  };

  const session = await api.create(formatPublicKey(playerKey.publicKey));
  out(`session ${session.sessionId} player ${session.playerAccountId} contract ${session.contractId}`);
  await drain(session.sessionId);
  const id = session.sessionId;
  const run = async (a: StepAction) => {
    out(`step ${a}`);
    await api.step(id, a);
    return drain(id);
  };

  await run('begin');
  await run('sell'); // day 1
  await run('next_day'); // day 2 opens

  // The player signs offer_leniency with their own function-call key, exactly as the browser does.
  const rpc = makeRpc();
  const seasonId = (await drain(id)).seasonId!;
  const player = new NearSigner({ accountId: session.playerAccountId, keyPair: parseSecretKey(formatSecretKey(playerKey)), rpc });
  const offer = await player.send(contractId, [
    { kind: 'functionCall', method: 'offer_leniency', args: new TextEncoder().encode(JSON.stringify({ season_id: seasonId })), gas: 30n * 10n ** 12n, deposit: 0n },
  ]);
  out(`offer_leniency ok=${offer.ok} tx ${offer.hash}`);
  if (!offer.ok) throw new Error(`offer_leniency failed: ${offer.errorCode}`);
  const res = await api.leniency(id, offer.hash);
  await drain(id);
  out(`leniency result: confessor=${res.confessor} phase=${res.status.phase}`);

  let status = res.status;
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
    `- leniency offered on day 2 by the player key; confessor: **${res.confessor ?? 'nobody (holdout)'}**`,
    `- pact: ${cf.pact ? `cap ${cf.pact.cap}, members ${cf.pact.members.length}` : 'none formed'}`,
    `- NEAR AI receipts: ${cf.receipts.length}, verified ${cf.receipts.filter((r) => r.verification.verified).length}`,
    '',
    '## Transactions',
    '',
    '| label | signer | ok | hash |',
    '|---|---|---|---|',
    ...cf.txs.map((t) => `| ${t.label} | ${t.signer} | ${t.ok ? 'yes' : `no (${t.errorCode})`} | [${t.hash}](${explorer(t.hash)}) |`),
    `| offer_leniency (browser-signed) | ${cf.playerAccountId} | ${offer.ok ? 'yes' : 'no'} | [${offer.hash}](${explorer(offer.hash)}) |`,
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
  const file = inProcess ? 'E2E-RUN.in-process.md' : 'E2E-RUN.md';
  writeFileSync(new URL(`../${file}`, import.meta.url), lines.join('\n'));
  out(`wrote server/${file}`);
}

main().catch((e) => {
  process.stderr.write(`e2e failed: ${(e as Error).message}\n`);
  process.exit(1);
});
