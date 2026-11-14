// Quick pool check: probe jobs for the given buyers (default marlow odile sully) with a 120 s cap; prints ms or the error.
//   npx tsx scripts/tee-ping.ts [buyer ...]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUYER_IDS, type BuyerId } from '../../shared/api.js';
import { NearSigner } from '../src/near/signer.js';
import { OutlayerTransport } from '../src/tee/outlayer.js';
import type { TeeDeployment } from '../src/tee/types.js';
import { REPO, loadDeployed, loadNearCredential, makeRpc } from './lib.js';

const dep = JSON.parse(readFileSync(join(REPO, 'outlayer/deployed.json'), 'utf8')) as TeeDeployment;
const { houseId } = loadDeployed();
const rpc = makeRpc();
const t = new OutlayerTransport({ deployment: dep, signer: new NearSigner({ accountId: houseId, keyPair: loadNearCredential(houseId), rpc }), rpc });
const asked = process.argv.slice(2).filter((a): a is BuyerId => (BUYER_IDS as readonly string[]).includes(a));
const buyers: BuyerId[] = asked.length ? asked : ['marlow', 'odile', 'sully'];
const rs = await Promise.allSettled(buyers.map((b) => t.run(b, { op: 'probe', nonce: 'ping' }, { timeoutMs: 120_000 })));
rs.forEach((r, i) => console.log(buyers[i], r.status === 'fulfilled' ? `${Math.round(r.value.ms / 1000)} s ok=${(r.value.output as { ok?: boolean } | null)?.ok ?? 'null'}` : String(r.reason).slice(0, 100)));
