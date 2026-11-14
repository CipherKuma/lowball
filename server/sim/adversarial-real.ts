// Runs the adversarial cases against the DEPLOYED testnet contract. Costs a few tenths of a NEAR in
// bonds (refunded or burned into the player account) and ~60 transactions.
//   npm run adversarial-real          -> writes sim/ADVERSARIAL-REAL.md
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUYER_IDS, type BuyerId } from '../../shared/api.js';
import { RealChain } from '../src/chain/real.js';
import type { Chain, TxResult } from '../src/chain/types.js';
import { nearToYocto, parseBuyerKeys } from '../src/near/accounts.js';
import { formatSecretKey, generateKeyPair, formatPublicKey } from '../src/near/keys.js';
import { NearSigner } from '../src/near/signer.js';
import { SECRETS_DIR, loadDeployed, loadNearCredential, makeRpc } from '../scripts/lib.js';
import { runAdversarial } from './adversarial.js';

async function main() {
  const { contractId, houseId } = loadDeployed();
  const rpc = makeRpc();
  const buyerKeys = parseBuyerKeys(readFileSync(join(SECRETS_DIR, `${contractId}.json`), 'utf8'));
  const real = new RealChain({ rpc, contractId, houseId, houseKey: formatSecretKey(loadNearCredential(houseId)), buyerKeys });
  const playerKey = generateKeyPair();
  const { accountId: player, tx } = await real.createPlayer(formatPublicKey(playerKey.publicKey));
  if (!tx.ok) throw new Error('could not create the player account');
  const signer = new NearSigner({ accountId: player, keyPair: playerKey, rpc });
  // The browser signs offer_leniency; here the throwaway player key does it.
  const chain = new Proxy(real, {
    get(t, k, r) {
      if (k === 'playerOffersLeniency') {
        // offer_leniency leaves a yielded receipt pending: wait for inclusion, then for the window to be live
        return async (seasonId: number): Promise<TxResult> => {
          const r = await signer.send(
            contractId,
            [{ kind: 'functionCall', method: 'offer_leniency', args: new TextEncoder().encode(JSON.stringify({ season_id: seasonId })), gas: 30n * 10n ** 12n, deposit: 0n }],
            'INCLUDED',
          );
          for (let i = 0; r.ok && i < 20; i++) {
            if ((await real.getSeason(seasonId)).leniency_open) break;
            await new Promise((x) => setTimeout(x, 1500));
          }
          return r;
        };
      }
      const v = Reflect.get(t, k, r);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  }) as unknown as Chain;
  const pactKeys = Object.fromEntries(BUYER_IDS.map((id) => [id, buyerKeys[id].pact])) as Record<BuyerId, (typeof buyerKeys)[BuyerId]['pact']>;
  const bond = nearToYocto('0.01'); // tiny bond: this run only checks refusals
  const results = await runAdversarial(chain, pactKeys, player, bond);
  const md = [
    '# Adversarial cases against the deployed contract',
    '',
    `Contract \`${contractId}\`, run ${new Date().toISOString()}. Command: \`cd server && npm run adversarial-real\``,
    '',
    '| case | expected | actual | pass |',
    '|---|---|---|---|',
    ...results.map((r) => `| ${r.name} | ${r.expected} | ${r.actual} | ${r.pass ? 'yes' : 'NO'} |`),
    '',
    `${results.filter((r) => r.pass).length} of ${results.length} as expected.`,
    '',
  ].join('\n');
  writeFileSync(new URL('./ADVERSARIAL-REAL.md', import.meta.url), md);
  process.stdout.write(md + '\n');
  if (results.some((r) => !r.pass)) process.exit(2);
}

main().catch((e) => {
  process.stderr.write(`adversarial-real failed: ${(e as Error).message}\n`);
  process.exit(1);
});
