// Sim harness: N seasons of D days with REAL NEAR AI calls against a rule-faithful mocked chain,
// plus a no-immunity baseline. Never fabricates: without NEARAI_API_KEY it writes a NOT RUN note.
//   npm run sim -- --seasons 10 --days 20 --baseline-seasons 5 --max-calls 1500
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { BUYER_IDS, type BuyerId } from '../../shared/api.js';
import { MockChain } from '../src/chain/mock.js';
import type { GameDeps } from '../src/game/ctx.js';
import { createSession, getEvents, leniency, step } from '../src/game/engine.js';
import { DEFAULT_MODEL, NearAiLlm } from '../src/llm/client.js';
import { generateKeyPair, formatPublicKey, type KeyPair } from '../src/near/keys.js';
import type { Llm } from '../src/llm/types.js';
import { MemoryStore } from '../src/store/memory.js';
import { runAdversarial } from './adversarial.js';

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? (process.argv[i + 1] ?? d) : d;
};
const SEASONS = Number(arg('--seasons', '10'));
const DAYS = Number(arg('--days', '20'));
const BASE_SEASONS = Number(arg('--baseline-seasons', '5'));
const MAX_CALLS = Number(arg('--max-calls', '1500'));
const CONCURRENCY = Number(arg('--concurrency', '3'));
const OFFER_DAYS = arg('--offer-days', '5,10,15,20').split(',').map(Number);
const BOND = 200_000_000_000_000_000_000_000n;
const here = (f: string) => new URL(`./${f}`, import.meta.url);

function loadKey(): string | undefined {
  if (process.env.NEARAI_API_KEY) return process.env.NEARAI_API_KEY;
  const p = new URL('../.env.local', import.meta.url);
  if (existsSync(p)) {
    const m = /^NEARAI_API_KEY=(.+)$/m.exec(readFileSync(p, 'utf8'));
    if (m) return m[1]!.trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

interface SeasonResult {
  mode: 'immunity' | 'baseline';
  pact: boolean;
  signers: number;
  cap: number | null;
  daysPlayed: number;
  confessionDay: number | null;
  confessor: BuyerId | null;
  offers: number;
  shortfallPerLot: number;
  identicalRate: number;
  error?: string;
}

async function playSeason(mode: SeasonResult['mode'], llm: Llm): Promise<SeasonResult> {
  const pactKeys = {} as Record<BuyerId, KeyPair>;
  const pubs = {} as Record<BuyerId, Uint8Array>;
  for (const id of BUYER_IDS) {
    pactKeys[id] = generateKeyPair();
    pubs[id] = pactKeys[id].publicKey;
  }
  const chain = new MockChain(pubs);
  const store = new MemoryStore();
  const deps: GameDeps = { store, chain, llm, pactKeys, config: { days: DAYS, bondYocto: BOND, minTreasuryYocto: 1n }, sleep: async () => chain.advanceBlocks(60), pollMs: 1 };
  const r: SeasonResult = { mode, pact: false, signers: 0, cap: null, daysPlayed: 0, confessionDay: null, confessor: null, offers: 0, shortfallPerLot: 0, identicalRate: 0 };
  try {
    const s = await createSession(deps, formatPublicKey(generateKeyPair().publicKey), 'sim');
    await step(deps, s.sessionId, 'begin');
    let status = (await getEvents(deps, s.sessionId, 0)).status;
    while (status.phase !== 'closed') {
      if (status.phase === 'lot_open') {
        // A real player can only offer once the case exists (2 identical days); offer on the listed days
        // when it does, otherwise keep selling to build it.
        if (mode === 'immunity' && OFFER_DAYS.includes(status.day) && status.leniencyAvailable) {
          // offer on the day's open lot, before selling it
          const tx = chain.playerOffersLeniency(status.seasonId!, s.playerAccountId);
          r.offers++;
          const res = await leniency(deps, s.sessionId, tx.hash);
          if (res.confessor) {
            r.confessionDay = status.day;
            r.confessor = res.confessor;
            break;
          }
        }
        await step(deps, s.sessionId, 'sell');
      } else {
        await step(deps, s.sessionId, 'next_day');
      }
      status = (await getEvents(deps, s.sessionId, 0)).status;
    }
    const view = await chain.getSeason(0);
    const settled = view.lots.filter((l) => l.settled);
    r.daysPlayed = settled.length;
    r.shortfallPerLot = settled.length ? view.shortfall / settled.length : 0;
    r.identicalRate = settled.length ? settled.filter((l) => l.identical).length / settled.length : 0;
    const st = await store.loadState(s.sessionId);
    r.pact = !!st?.pact;
    r.signers = st?.pact?.members.length ?? 0;
    r.cap = st?.pact?.cap ?? null;
  } catch (e) {
    r.error = String((e as Error).message ?? e).slice(0, 160);
  }
  return r;
}

async function pool<T>(n: number, concurrency: number, job: (i: number) => Promise<T>): Promise<T[]> {
  const out: T[] = new Array(n);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, n) }, async () => {
      while (next < n) {
        const i = next++;
        out[i] = await job(i);
      }
    }),
  );
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}% (${n}/${d})` : 'n/a');

function summarise(rs: SeasonResult[]) {
  const ok = rs.filter((r) => !r.error);
  const withPact = ok.filter((r) => r.pact);
  const conf = withPact.filter((r) => r.confessionDay !== null);
  return { ok, withPact, conf };
}

async function main() {
  if (process.argv.includes('--smoke-scripted')) {
    // Harness plumbing check with a SCRIPTED model. Prints to stdout only; never written to RESULTS.md.
    const { ScriptedLlm, DEFAULT_POLICY } = await import('../test/helpers.js');
    const llm = new ScriptedLlm({ ...DEFAULT_POLICY, confess: ['sully'] });
    const rs = [await playSeason('immunity', llm), await playSeason('baseline', llm)];
    process.stdout.write(rs.map((r) => JSON.stringify(r)).join('\n') + '\n');
    return;
  }
  const key = loadKey();
  const model = process.env.NEARAI_MODEL ?? DEFAULT_MODEL;
  const cmd = `cd server && npm run sim -- ${process.argv.slice(2).join(' ')}`.trim();
  const advMock = await adversarialMock();
  if (!key) {
    writeFileSync(
      here('RESULTS.md'),
      `# Sim results\n\n**NOT RUN: NEARAI_API_KEY is not available.** No numbers are reported because none were measured.\n\nCommand once the key is in the vault (\`~/.claude/vault/inject.sh get NEARAI_API_KEY --dir server\`):\n\n\`${cmd}\`\n\n${advMock}`,
    );
    process.stdout.write('NEARAI_API_KEY missing: wrote NOT RUN note to sim/RESULTS.md\n');
    return;
  }
  const llm = new NearAiLlm({ apiKey: key, model, maxCalls: MAX_CALLS });
  const t0 = Date.now();
  process.stdout.write(`immunity seasons: ${SEASONS} x ${DAYS} days, model ${model}\n`);
  const imm = await pool(SEASONS, CONCURRENCY, (i) => playSeason('immunity', llm).then((r) => (process.stdout.write(`  immunity ${i + 1}: ${JSON.stringify(r)}\n`), r)));
  const base = await pool(BASE_SEASONS, CONCURRENCY, (i) => playSeason('baseline', llm).then((r) => (process.stdout.write(`  baseline ${i + 1}: ${JSON.stringify(r)}\n`), r)));
  const A = summarise(imm);
  const B = summarise(base);
  const firstDays = A.conf.map((r) => r.confessionDay!);
  const md = [
    '# Sim results (real NEAR AI calls, mocked chain)',
    '',
    `Command: \`${cmd}\``,
    `Run: ${new Date().toISOString()}, ${Math.round((Date.now() - t0) / 1000)}s. Model \`${model}\`. NEAR AI completions used: ${llm.calls} (cap ${MAX_CALLS}).`,
    `Chain: \`MockChain\`, which enforces the contract rules and error codes in the same order (see src/chain/mock.ts); the real contract is exercised by E2E-RUN.md.`,
    `Player policy (immunity arm): offer leniency on days ${OFFER_DAYS.join(', ')} before selling that day's lot; never in the baseline arm. ${DAYS}-day seasons.`,
    '',
    '| metric | immunity | no-immunity baseline |',
    '|---|---|---|',
    `| seasons completed (of requested) | ${A.ok.length} of ${SEASONS} | ${B.ok.length} of ${BASE_SEASONS} |`,
    `| pact formation rate | ${pct(A.withPact.length, A.ok.length)} | ${pct(B.withPact.length, B.ok.length)} |`,
    `| mean signers when a pact formed | ${f(mean(A.withPact.map((r) => r.signers)))} | ${f(mean(B.withPact.map((r) => r.signers)))} |`,
    `| mean pact cap (marks) | ${f(mean(A.withPact.map((r) => r.cap ?? NaN)), 0)} | ${f(mean(B.withPact.map((r) => r.cap ?? NaN)), 0)} |`,
    `| first-confession rate (pact seasons that saw a confession) | ${pct(A.conf.length, A.withPact.length)} | n/a (never offered) |`,
    `| first-confession day (mean / min / max) | ${f(mean(firstDays))} / ${firstDays.length ? Math.min(...firstDays) : 'n/a'} / ${firstDays.length ? Math.max(...firstDays) : 'n/a'} | n/a |`,
    `| mean shortfall per lot (marks, fair value minus price) | ${f(mean(A.ok.map((r) => r.shortfallPerLot)))} | ${f(mean(B.ok.map((r) => r.shortfallPerLot)))} |`,
    `| mean share of lots with identical bids | ${f(100 * mean(A.ok.map((r) => r.identicalRate)), 0)}% | ${f(100 * mean(B.ok.map((r) => r.identicalRate)), 0)}% |`,
    `| mean lots settled per season | ${f(mean(A.ok.map((r) => r.daysPlayed)))} | ${f(mean(B.ok.map((r) => r.daysPlayed)))} |`,
    '',
    `Confessors (immunity arm): ${BUYER_IDS.map((b) => `${b} ${A.conf.filter((r) => r.confessor === b).length}`).join(', ')}.`,
    '',
    `Errors: ${[...imm, ...base].filter((r) => r.error).map((r) => `${r.mode}: ${r.error}`).join(' | ') || 'none'}`,
    '',
    '## Per season',
    '',
    '```',
    ...[...imm, ...base].map((r) => JSON.stringify(r)),
    '```',
    '',
    advMock,
  ].join('\n');
  writeFileSync(here('RESULTS.md'), md);
  process.stdout.write('wrote sim/RESULTS.md\n');
}

async function adversarialMock(): Promise<string> {
  const pactKeys = {} as Record<BuyerId, KeyPair>;
  const pubs = {} as Record<BuyerId, Uint8Array>;
  for (const id of BUYER_IDS) {
    pactKeys[id] = generateKeyPair();
    pubs[id] = pactKeys[id].publicKey;
  }
  const res = await runAdversarial(new MockChain(pubs), pactKeys, 'p1.house.mock.testnet', BOND);
  return [
    '## Adversarial cases (MockChain)',
    '',
    'The same cases run against the deployed contract with `npm run adversarial-real` (see README).',
    '',
    '| case | expected | actual | pass |',
    '|---|---|---|---|',
    ...res.map((r) => `| ${r.name} | ${r.expected} | ${r.actual} | ${r.pass ? 'yes' : 'NO'} |`),
    '',
  ].join('\n');
}

main().catch((e) => {
  process.stderr.write(`sim failed: ${(e as Error).message}\n`);
  process.exit(1);
});
