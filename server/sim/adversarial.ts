// Adversarial contract cases. Chain-agnostic: runs against MockChain in tests and against the
// deployed testnet contract via `npm run sim -- --adversarial-real` once it exists.
import { sha256 } from '@noble/hashes/sha256';
import { BUYER_IDS, type BuyerId, type ErrorCode } from '../../shared/api.js';
import type { Chain, PactJson, PactSigJson, TxResult } from '../src/chain/types.js';
import { concat } from '../src/near/bytes.js';
import { generateKeyPair, type KeyPair } from '../src/near/keys.js';
import { pactToJson, randomNonce, signPact, sigToJson, type Pact } from '../src/near/pact.js';

export interface CaseResult {
  name: string;
  expected: ErrorCode | 'ok';
  actual: ErrorCode | 'ok';
  pass: boolean;
}

const u32le = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
};
const salt = () => crypto.getRandomValues(new Uint8Array(32));

export async function runAdversarial(
  chain: Chain,
  pactKeys: Record<BuyerId, KeyPair>,
  player: string,
  bond: bigint,
  days = 2,
): Promise<CaseResult[]> {
  const buyers = BUYER_IDS.map((id) => `${id}.${chain.houseId}`);
  const acct = (id: BuyerId) => `${id}.${chain.houseId}`;
  const results: CaseResult[] = [];
  const record = (name: string, expected: ErrorCode | 'ok', r: TxResult) => {
    const actual = r.ok ? 'ok' : (r.errorCode ?? 'TX_FAILED');
    results.push({ name, expected, actual, pass: actual === expected });
  };
  const mustOk = (r: TxResult & { seasonId?: number }, what: string) => {
    if (!r.ok) throw new Error(`adversarial setup failed at ${what}: ${r.errorCode}`);
    return r;
  };
  const newSeason = async (withBonds: boolean, lot: boolean) => {
    const cs = mustOk(await chain.createSeason(player, buyers, days, bond), 'create_season');
    const id = cs.seasonId!;
    if (withBonds) for (const b of BUYER_IDS) mustOk(await chain.postBond(b, id, bond), 'post_bond');
    if (lot) mustOk(await chain.openLot(id, 'Atlantic cod', 100, 40), 'open_lot');
    return id;
  };
  const sign = (p: Pact, ids: BuyerId[], keys = pactKeys): PactSigJson[] =>
    ids.map((id) => sigToJson(acct(id), signPact(p, keys[id])));
  const mkPact = (seasonId: number, ids: BuyerId[], members?: string[]): Pact => ({
    seasonId, cap: 50, members: members ?? ids.map(acct), nonce: randomNonce(),
  });
  const ids3: BuyerId[] = ['marlow', 'odile', 'sully'];

  // 1. bid before bond
  const s1 = await newSeason(false, false);
  record('commit before bond posted', 'E_NO_BOND', await chain.commitBid('marlow', s1, sha256(concat(u32le(1), salt()))));
  record('open lot before bonds posted', 'E_BONDS_MISSING', await chain.openLot(s1, 'Atlantic cod', 100, 40));
  record('create_season with a malformed payout address', 'E_BAD_EVM', await chain.createSeason(player, buyers, days, bond, '0x1234'));

  // 2. wrong deposit
  record('post_bond with wrong deposit', 'E_BAD_DEPOSIT', await chain.postBond('marlow', s1, bond + 1n));

  // 3. double commit, 4. reveal mismatch
  const s2 = await newSeason(true, true);
  const sa = salt();
  mustOk(await chain.commitBid('marlow', s2, sha256(concat(u32le(40), sa))), 'commit');
  record('double commit', 'E_ALREADY_COMMITTED', await chain.commitBid('marlow', s2, sha256(concat(u32le(41), sa))));
  record('reveal that does not match the commitment', 'E_BAD_REVEAL', await chain.revealBid('marlow', s2, 99, sa));

  // 5. confess with no leniency window
  const p2 = mkPact(s2, ids3);
  record('confess before leniency is offered', 'E_NO_LENIENCY', await chain.confess('marlow', s2, pactToJson(p2), sign(p2, ids3)));

  // Leniency offered on a fresh season so every pact check below reaches the signature logic.
  const s3 = await newSeason(true, true);
  const open = (chain as unknown as { playerOffersLeniency?: (id: number, p: string) => TxResult | Promise<TxResult> }).playerOffersLeniency;
  if (open) {
    mustOk(await open.call(chain, s3, player), 'offer_leniency');
    const good = mkPact(s3, ids3);
    const goodSigs = sign(good, ids3);
    const gj = pactToJson(good);

    const other = mkPact(s3 + 1000, ids3);
    record('pact signed for another season', 'E_SEASON_MISMATCH', await chain.confess('marlow', s3, pactToJson(other), sign(other, ids3)));
    const replay = { ...gj, season_id: s3 };
    const replaySigs = sign(mkPact(s3 + 1000, ids3), ids3); // signatures made over a different season's message
    record('replayed signatures from another season', 'E_BAD_SIG', await chain.confess('marlow', s3, replay as PactJson, replaySigs));
    const rogue = generateKeyPair();
    record('signature by an unregistered key', 'E_BAD_SIG', await chain.confess('marlow', s3, gj, [goodSigs[0]!, goodSigs[1]!, sigToJson(acct('sully'), signPact(good, rogue))]));
    const withStranger = mkPact(s3, ids3, [...ids3.map(acct), 'stranger.testnet']);
    record('pact including a non-season account', 'E_NOT_MEMBER', await chain.confess('marlow', s3, pactToJson(withStranger), sign(withStranger, ids3)));
    record('duplicate signer', 'E_DUP_SIGNER', await chain.confess('marlow', s3, gj, [goodSigs[0]!, goodSigs[0]!, goodSigs[1]!]));
    record('only one signature (fewer than two)', 'E_TOO_FEW', await chain.confess('marlow', s3, gj, [goodSigs[0]!]));
    record('confessor own signature missing', 'E_TOO_FEW', await chain.confess('marlow', s3, gj, [goodSigs[1]!, goodSigs[2]!]));
    // The valid confession wins, then a second one is refused.
    record('valid confession accepted', 'ok', await chain.confess('marlow', s3, gj, goodSigs));
    record('second confession after the first', 'E_ALREADY_CONFESSED', await chain.confess('odile', s3, gj, goodSigs));
  }

  // 6. open lot past the last day
  const s4 = await newSeason(true, true);
  for (let d = 1; d <= days; d++) {
    const salts = BUYER_IDS.map(() => salt());
    for (const [i, b] of BUYER_IDS.entries()) {
      mustOk(await chain.commitBid(b, s4, sha256(concat(u32le(50), salts[i]!))), 'commit');
      mustOk(await chain.revealBid(b, s4, 50, salts[i]!), 'reveal');
    }
    mustOk(await chain.settleLot(s4), 'settle');
    if (d < days) mustOk(await chain.openLot(s4, 'Atlantic cod', 100, 40), 'open_lot');
  }
  record('open lot past the last day', 'E_PAST_DAYS', await chain.openLot(s4, 'Atlantic cod', 100, 40));
  const s5 = await newSeason(true, false);
  record('open lot with zero weight', 'E_BAD_ARGS', await chain.openLot(s5, 'Atlantic cod', 100, 0));
  return results;
}
