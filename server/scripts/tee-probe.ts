// Runs `probe` in all five buyer enclaves (house-signed OutLayer jobs), checks the TEE keys are stable across
// two passes, and writes them to outlayer/deployed.json plus outlayer/evidence/tee-probe.json.
//   npm run tee-probe            (needs ~/.near-credentials/testnet/lowball-house-ck.testnet.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUYER_IDS } from '../../shared/api.js';
import { NearSigner } from '../src/near/signer.js';
import { OutlayerTransport } from '../src/tee/outlayer.js';
import type { TeeDeployment } from '../src/tee/types.js';
import { REPO, loadDeployed, loadNearCredential, makeRpc } from './lib.js';

const out = (s: string) => process.stdout.write(s + '\n');
const path = join(REPO, 'outlayer/deployed.json');
const deployment = JSON.parse(readFileSync(path, 'utf8')) as TeeDeployment;
const { houseId } = loadDeployed();
const rpc = makeRpc();
const signer = new NearSigner({ accountId: houseId, keyPair: loadNearCredential(houseId), rpc });
const transport = new OutlayerTransport({ deployment, signer, rpc });

const only = process.argv.slice(2).filter((a) => (BUYER_IDS as readonly string[]).includes(a));
const targets = only.length ? (only as typeof BUYER_IDS[number][]) : [...BUYER_IDS];
const passes: Record<string, { pass: number; tx: string; ms: number; key: string; hasApiKey: boolean; modelListed: boolean | null; allowed: string }[]> = {};
for (let pass = 1; pass <= 2; pass++) {
  const rs = await Promise.allSettled(
    targets.map(async (b) => {
      const r = await transport.run(b, { op: 'probe', nonce: `p${pass}${b}` });
      const o = r.output as Record<string, unknown> | null;
      if (!o || o.ok !== true) throw new Error(`${b}: ${JSON.stringify(o)?.slice(0, 200)}`);
      (passes[b] ??= []).push({ pass, tx: r.txHash, ms: r.ms, key: String(o.public_key_b64), hasApiKey: o.has_api_key === true, modelListed: (o.model_listed as boolean | null) ?? null, allowed: String(o.allowed_callers) });
      out(`pass ${pass} ${b}: ${r.txHash} ${Math.round(r.ms / 1000)}s key ${String(o.public_key_b64).slice(0, 12)}… api_key=${o.has_api_key}`);
    }),
  );
  for (const r of rs) if (r.status === 'rejected') out(`FAILED: ${String(r.reason)}`);
}
for (const b of targets) {
  const ps = passes[b] ?? [];
  if (ps.length === 2 && ps[0]!.key === ps[1]!.key) {
    const hex = Buffer.from(ps[0]!.key, 'base64').toString('hex');
    deployment.buyers[b].publicKeyB64 = ps[0]!.key;
    deployment.buyers[b].publicKeyHex = hex;
  } else out(`${b}: key not stable or missing`);
}
writeFileSync(path, JSON.stringify(deployment, null, 2) + '\n');
writeFileSync(join(REPO, 'outlayer/evidence/tee-probe.json'), JSON.stringify({ at: new Date().toISOString(), passes }, null, 2) + '\n');
out('wrote outlayer/deployed.json');
