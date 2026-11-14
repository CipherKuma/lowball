// Full attestation verification for the buyer model. Writes a dated evidence file that the Worker reads.
//   cd server && npm run verify-attestation                 (model from wrangler.toml; attestation reads need no API key)
//   npm run verify-attestation -- --model z-ai/glm-5.3-flash --algo ecdsa --accept-tcb UpToDate
//   npm run verify-attestation -- --record-fixture          (also records test/fixtures/attestation-recorded.json)
//   npm run verify-attestation -- --live                    (after attestation: one real completion through the
//                                                            production client; needs NEARAI_API_KEY from server/.env.local)
// Exit code 0 only when every required check passed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCollateral, PHALA_PCCS_URL, verify, type Collateral } from '@phala/dcap-qvl';
import { parseTdxQuote, randomNonce, type NearReport, type QuoteFields } from '../src/llm/attestation.js';
import type { AttestationEvidence } from '../src/llm/evidence.js';
import { NRAS_JWKS_URL, NRAS_URL, uniqueSigners, verifyCandidate, type QuoteVerdict, type RunDeps } from '../src/llm/evidence-run.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://cloud-api.near.ai/v1';
const arg = (n: string, d?: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? (process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] === undefined ? 'true' : process.argv[i + 1]) : d;
};

/** inject.sh writes server/.env.local; read NEARAI_API_KEY from it when the shell has none. Never printed. */
function loadKeyFromEnvLocal(): void {
  if (process.env.NEARAI_API_KEY) return;
  try {
    const m = /^NEARAI_API_KEY=(.*)$/m.exec(readFileSync(join(ROOT, '.env.local'), 'utf8'));
    if (m?.[1]) process.env.NEARAI_API_KEY = m[1].trim().replace(/^["']|["']$/g, '');
  } catch {
    /* no .env.local */
  }
}

function modelFromToml(): string {
  const t = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8');
  return /^NEARAI_MODEL\s*=\s*"([^"]+)"/m.exec(t)?.[1] ?? 'z-ai/glm-5.3-flash';
}

function fieldsFromVerified(r: any): QuoteFields {
  if (r.type !== 'td10') throw new Error(`expected a TDX td10 quote, got ${r.type}`);
  const d = r.data;
  return { tdAttributes: d.tdAttributes, mrTd: d.mrTd, mrConfigId: d.mrConfigId, rtMr0: d.rtMr0, rtMr1: d.rtMr1, rtMr2: d.rtMr2, rtMr3: d.rtMr3, reportData: d.reportData };
}

async function main() {
  loadKeyFromEnvLocal();
  const model = arg('model') ?? process.env.NEARAI_MODEL ?? modelFromToml();
  const algo = arg('algo', 'ecdsa')!;
  const accepted = arg('accept-tcb', 'UpToDate')!.split(',');
  const pccs = arg('pccs', PHALA_PCCS_URL)!;
  const record = arg('record-fixture') === 'true';
  const now = new Date();
  const nowSecs = Math.floor(now.getTime() / 1000);
  const date = now.toISOString().slice(0, 10);
  const slug = model.replace(/[^a-z0-9.]+/gi, '-').toLowerCase();
  const evidenceName = `attestation-${slug}-${date}.json`;
  const nonce = randomNonce();
  const key = process.env.NEARAI_API_KEY;
  const headers: Record<string, string> = { 'x-no-aliasing': 'true', accept: 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) };

  console.error(`model ${model}  algo ${algo}  accepted TCB ${accepted.join(',')}`);
  const cat: any = await (await fetch(`${BASE}/models`, { headers })).json();
  const entry = (cat.data ?? []).find((m: any) => m.id === model);
  const ownedBy = String(entry?.owned_by ?? 'unlisted');
  // docs.near.ai/cloud/models: Confidential TEE = NEAR AI's own GPU fleet (provider "nearai"); Incognito = upstream, outside a TEE.
  const tier = ownedBy === 'nearai' ? 'Confidential TEE (own fleet)' : ownedBy === 'attested 3p' ? '3P Confidential TEE' : 'NOT a NEAR-operated TEE (Incognito or unlisted)';

  const q = new URLSearchParams({ model, provider: 'near', signing_algo: algo, include_tls_fingerprint: 'false', nonce });
  const res = await fetch(`${BASE}/attestation/report?${q}`, { headers });
  if (!res.ok) throw new Error(`attestation report HTTP ${res.status}`);
  const body: any = await res.json();
  const gw: NearReport | undefined = body.gateway_attestation;
  const cands: NearReport[] = body.model_attestations ?? [];

  const collaterals = new Map<string, Collateral>();
  const nras: Record<string, string> = {};
  const deps: RunDeps = {
    nowSecs,
    acceptedTcbStatuses: accepted,
    gpuRequired: true,
    fetchFn: (async (url: any, init?: any) => {
      const r = await fetch(url, init);
      if (record && (url === NRAS_URL || url === NRAS_JWKS_URL) && !(url in nras)) nras[url] = await r.clone().text();
      return r;
    }) as typeof fetch,
    async verifyQuote(quote: Uint8Array): Promise<QuoteVerdict> {
      const col = await getCollateral(pccs, quote);
      collaterals.set(Buffer.from(quote).toString('hex').slice(0, 64), col);
      const v = verify(quote, col, nowSecs);
      const fields = fieldsFromVerified(v.report);
      // Cross-check dcap-qvl's verified fields against our own parse of the raw quote.
      const own = parseTdxQuote(quote);
      if (Buffer.from(own.reportData).toString('hex') !== Buffer.from(fields.reportData).toString('hex')) throw new Error('quote parser disagreement');
      return { status: v.status, advisoryIds: v.advisory_ids, fields };
    },
  };

  const gateway = gw ? await verifyCandidate(gw, nonce, deps, false) : null;
  const models = [];
  for (const c of cands) models.push(await verifyCandidate(c, nonce, deps, true));
  const goodModels = models.filter((m) => m.verified);
  const tierOk = ownedBy === 'nearai' || ownedBy === 'attested 3p';
  const verified = !!gateway?.verified && models.length > 0 && goodModels.length === models.length && tierOk;

  const evidenceUrl = arg('evidence-url') ?? `server/evidence/${evidenceName}`;
  const evidence: AttestationEvidence = {
    schema: 1,
    model,
    catalogue: { ownedBy, tier, source: `${BASE}/models` },
    checkedAt: now.toISOString(),
    checker: 'server/scripts/verify-attestation.ts (@phala/dcap-qvl 0.7.1; collateral ' + pccs + '; NVIDIA NRAS + JWKS)',
    evidenceUrl,
    policy: { acceptedTcbStatuses: accepted, gpuEvidenceRequired: true, signingAlgos: [algo] },
    verified,
    gateway: { verified: !!gateway?.verified, signers: gateway?.verified ? uniqueSigners([gateway]) : [], candidate: gateway },
    models,
    modelSigners: verified ? uniqueSigners(goodModels) : [],
    notChecked: [
      'measurements are recorded but not compared with an approved allowlist (NEAR AI publishes none we could pin)',
      'image provenance (docs.near.ai/cloud/verification/cloud-api/image-provenance) not checked',
      'TLS endpoint binding not checked (no pinned TLS fetch in this script)',
      'the signer is shared by all instances of the model: a response is not tied to one specific serving instance',
    ],
  };

  mkdirSync(join(ROOT, 'evidence', 'raw'), { recursive: true });
  const out = JSON.stringify(evidence, null, 2) + '\n';
  writeFileSync(join(ROOT, 'evidence', evidenceName), out);
  writeFileSync(join(ROOT, 'src', 'llm', 'attestation-evidence.json'), out);
  writeFileSync(join(ROOT, 'evidence', 'raw', evidenceName.replace('.json', '.report.json.gz')), gzipSync(JSON.stringify({ nonce, report: body })));
  if (record) recordFixture(nonce, body, collaterals, nras, nowSecs);

  for (const [label, c] of [['gateway', gateway], ...models.map((m, i) => [`model[${i}]`, m] as const)] as const) {
    if (!c) continue;
    console.error(`${label} ${c.verified ? 'PASS' : 'FAIL'}  tcb=${c.tcbStatus}  signer=${c.signing_address.slice(0, 12)}...`);
    for (const k of c.checks.filter((x) => !x.ok)) console.error(`   x ${k.name}: ${k.detail ?? ''}`);
  }
  console.error(`tier: ${tier}`);
  console.error(`evidence ${verified ? 'VERIFIED' : 'NOT VERIFIED'} -> ${relative(process.cwd(), join(ROOT, 'evidence', evidenceName))}`);
  const liveOk = arg('live') === 'true' ? await liveCheck(model, evidence) : true;
  process.exit(verified && liveOk ? 0 : 1);
}

/** One real structured-output completion through the production client; needs NEARAI_API_KEY. */
async function liveCheck(model: string, evidence: AttestationEvidence): Promise<boolean> {
  const key = process.env.NEARAI_API_KEY;
  if (!key) {
    console.error('live check needs NEARAI_API_KEY: ~/.claude/vault/inject.sh get NEARAI_API_KEY --dir server, then source server/.env.local');
    return false;
  }
  const { NearAiLlm } = await import('../src/llm/client.js');
  const { BidOut, JSON_SCHEMAS } = await import('../src/llm/schemas.js');
  const llm = new NearAiLlm({ apiKey: key, model, evidence });
  const t0 = Date.now();
  const r = await llm.complete({
    buyer: 'odile', kind: 'bid', day: 1, schemaName: 'bid', schema: BidOut, jsonSchema: JSON_SCHEMAS.bid,
    system: 'You are Odile Fenn, a cannery accountant bidding on a lot of fish worth 100 marks. Reply as JSON.',
    user: 'Day 1. Place your bid (integer marks), a one-line remark, and your mood.',
  });
  const ms = Date.now() - t0;
  const v = (await r.receipt).verification;
  const summary = await llm.attestation();
  console.error(`live completion ${ms} ms  chat ${r.chatId}  output ${JSON.stringify(r.value)}`);
  console.error(`receipt: kind=${v.signatureKind} textMatches=${v.textMatches} signatureValid=${v.signatureValid} signerMatchesPreflight=${v.signerMatchesPreflight} quoteVerified=${v.quoteVerified} verified=${v.verified}${v.error ? ' error=' + v.error : ''}`);
  console.error(`case file attestation: ${JSON.stringify(summary)}`);
  return v.signatureKind === 'provider_tee' && v.verified && v.quoteVerified && summary.verified;
}

function recordFixture(nonce: string, body: any, collaterals: Map<string, Collateral>, nras: Record<string, string>, nowSecs: number): void {
  const trim = (r: any, keepGpu: boolean) => {
    const o = { ...r, info: { ...r.info, app_cert: undefined }, compose_manager_attestation: undefined, ohttp_attestation: undefined, ohttp_key_config: undefined };
    if (keepGpu && r.nvidia_payload) o.nvidia_payload = JSON.stringify({ nonce: JSON.parse(r.nvidia_payload).nonce, trimmed: 'GPU evidence elided; NRAS reply recorded separately' });
    return o;
  };
  const fx = {
    note: 'Recorded from the live public NEAR AI attestation endpoint; reports trimmed (GPU evidence, app_cert, ohttp). Not secret.',
    recordedAt: new Date(nowSecs * 1000).toISOString(),
    nowSecs,
    nonce,
    gateway_attestation: trim(body.gateway_attestation, false),
    model_attestations: (body.model_attestations as any[]).slice(0, 1).map((m) => trim(m, true)),
    // key: first 64 hex chars of the quote; only the quotes kept above
    collateral: Object.fromEntries(
      [body.gateway_attestation, body.model_attestations[0]].map((r: any) => {
        const k = String(r.intel_quote).slice(0, 64);
        return [k, collaterals.get(k)];
      }),
    ),
    nras: { postUrl: NRAS_URL, jwksUrl: NRAS_JWKS_URL, postResponse: nras[NRAS_URL], jwks: nras[NRAS_JWKS_URL] },
  };
  const p = join(ROOT, 'test', 'fixtures', 'attestation-recorded.json');
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(fx));
  console.error(`fixture written ${relative(process.cwd(), p)}`);
}

main().catch((e) => {
  console.error('verify-attestation failed:', e instanceof Error ? e.message : e);
  process.exit(2);
});
