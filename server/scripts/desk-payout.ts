// Manual payout desk runs (testnet NEAR + Sepolia). Never prints keys.
//
//   npx tsx scripts/desk-payout.ts <season_id>      relay a signed payout to Sepolia and print the receipt
//   npx tsx scripts/desk-payout.ts --address        derive the desk's Sepolia address offline, cross-check it
//                                                   with the signer's derived_public_key view, print balance
//   npx tsx scripts/desk-payout.ts --sync           set the desk's nonce/fees to the address's Sepolia state
//                                                   (needs the house key in ~/.near-credentials)
//   npx tsx scripts/desk-payout.ts --show <season>  print the stored payout record
//
// Env: DESK_ID (default: contracts/payout-desk/deployed.json or desk.lowball-ck.testnet),
//      SIGNER_ID (v1.signer-prod.testnet), HOUSE_ID, RPC_URLS, SEPOLIA_RPC_URLS (comma separated).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addressFromPubkey64, deriveDeskAddress, DESK_PATH, parseNearSecp256k1 } from '../src/chainsig/derive.js';
import { deskView, getConfig, getPayout, syncDesk } from '../src/chainsig/desk.js';
import { EvmRpc } from '../src/chainsig/evm.js';
import { relayPayout } from '../src/chainsig/relay.js';
import { ChainsigError } from '../src/chainsig/types.js';
import { NearSigner } from '../src/near/signer.js';
import { loadNearCredential, makeRpc, REPO } from './lib.js';

const SIGNER_ID = process.env.SIGNER_ID ?? 'v1.signer-prod.testnet';

function deskId(): string {
  if (process.env.DESK_ID) return process.env.DESK_ID;
  const p = join(REPO, 'contracts/payout-desk/deployed.json');
  if (existsSync(p)) return (JSON.parse(readFileSync(p, 'utf8')) as { deskId: string }).deskId;
  return 'desk.lowball-ck.testnet';
}

function evm(): EvmRpc {
  const urls = process.env.SEPOLIA_RPC_URLS?.split(',').map((s) => s.trim());
  return new EvmRpc({ urls });
}

/** Offline derivation from the MPC root key, cross-checked against the signer's own derived_public_key view. */
async function address(desk: string): Promise<string> {
  const near = makeRpc();
  const root = await deskView<string>(near, SIGNER_ID, 'public_key', { domain_id: 0 });
  const offline = deriveDeskAddress(root, desk, DESK_PATH);
  const view = await deskView<string>(near, SIGNER_ID, 'derived_public_key', { path: DESK_PATH, predecessor: desk, domain_id: 0 });
  const viaView = addressFromPubkey64(parseNearSecp256k1(view));
  if (viaView !== offline) throw new Error(`derivation mismatch: offline ${offline}, signer view ${viaView}`);
  return offline;
}

async function main() {
  const [a, b] = process.argv.slice(2);
  const desk = deskId();
  const near = makeRpc();
  if (a === '--address') {
    const offline = await address(desk);
    const rpc = evm();
    const bal = await rpc.getBalance(offline);
    console.log(JSON.stringify({ desk, path: DESK_PATH, signer: SIGNER_ID, sepoliaAddress: offline, balanceWei: bal.toString(), balanceEth: Number(bal) / 1e18 }, null, 2));
    return;
  }
  if (a === '--show') {
    console.log(JSON.stringify(await getPayout(near, desk, Number(b)), null, 2));
    return;
  }
  if (a === '--sync') {
    const house = process.env.HOUSE_ID ?? ((await getConfig(near, desk)).owner as string);
    const signer = new NearSigner({ accountId: house, keyPair: loadNearCredential(house), rpc: near });
    const addr = await address(desk);
    console.log(JSON.stringify(await syncDesk(near, evm(), signer, desk, addr), (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
    return;
  }
  const seasonId = Number(a);
  if (!Number.isInteger(seasonId) || seasonId < 0) {
    console.error('usage: desk-payout.ts <season_id> | --address | --sync | --show <season_id>');
    process.exit(2);
  }
  const rpc = evm();
  const result = await relayPayout(seasonId, { near, evm: rpc, deskId: desk });
  console.log(JSON.stringify({ ...result, explorer: `https://sepolia.etherscan.io/tx/${result.sepoliaTx}`, provider: rpc.lastUrl }, null, 2));
  if (result.status !== 'success') process.exit(result.status === 'pending' ? 3 : 1);
}

main().catch((e) => {
  console.error(e instanceof ChainsigError ? `${e.code}: ${e.message}` : String(e));
  process.exit(1);
});
