// Assemble the broadcastable Sepolia transaction from a desk payout record, trusting nothing:
// the unsigned tx is re-parsed and re-serialised, its digest and recipient/amount are compared with
// the record, and the signature must recover to the desk's own address.
import { secp256k1 } from '@noble/curves/secp256k1';
import { fromHex, toHex } from '../near/bytes.js';
import { addressFromPubkey64, sameAddress } from './derive.js';
import { keccak, parseUnsigned, serializeSigned, signingPreimage, txHash } from './tx.js';
import { ChainsigError, type DeskPayout } from './types.js';

export const SEPOLIA_CHAIN_ID = 11155111n;

export interface Assembled {
  rawHex: string;
  txHash: string;
  from: string;
  valueWei: bigint;
  maxCostWei: bigint;
}

const N = secp256k1.CURVE.n;

export function assembleSigned(p: DeskPayout, deskAddress?: string | null): Assembled {
  if (p.status !== 'Signed' || !p.big_r || !p.s || p.recovery_id === null) {
    throw new ChainsigError('BAD_PAYOUT', `payout for season ${p.season_id} is not signed`);
  }
  const t = parseUnsigned(p.unsigned_tx);
  const pre = signingPreimage(t);
  const digest = keccak(pre);
  if (`0x${toHex(pre)}` !== p.unsigned_tx.toLowerCase() || `0x${toHex(digest)}` !== p.digest.toLowerCase()) {
    throw new ChainsigError('BAD_PAYOUT', 'unsigned transaction does not match its digest');
  }
  if (t.chainId !== SEPOLIA_CHAIN_ID) throw new ChainsigError('BAD_PAYOUT', `unexpected chain id ${t.chainId}`);
  if (t.to !== p.to.toLowerCase() || t.valueWei !== BigInt(p.amount_wei)) {
    throw new ChainsigError('BAD_PAYOUT', 'recipient or amount differ from the payout record');
  }

  const bigR = fromHex(p.big_r);
  if (bigR.length !== 33) throw new ChainsigError('BAD_PAYOUT', 'big_r must be a 33-byte compressed point');
  const r = BigInt(`0x${toHex(bigR.slice(1))}`);
  let s = BigInt(p.s);
  if (s > N / 2n) s = N - s; // Ethereum clients reject high-s (EIP-2)
  const sig = new secp256k1.Signature(r, s);

  // Try the MPC's recovery id first, then the other parity (s was possibly flipped above).
  const parities: Array<0 | 1> = [(p.recovery_id & 1) as 0 | 1, ((p.recovery_id & 1) ^ 1) as 0 | 1];
  for (const y of parities) {
    let from: string;
    try {
      from = addressFromPubkey64(sig.addRecoveryBit(y).recoverPublicKey(digest).toRawBytes(false).slice(1));
    } catch {
      continue;
    }
    if (deskAddress && !sameAddress(from, deskAddress)) continue;
    const raw = serializeSigned(t, y, fromHex(r.toString(16).padStart(64, '0')), fromHex(s.toString(16).padStart(64, '0')));
    return { rawHex: `0x${toHex(raw)}`, txHash: txHash(raw), from, valueWei: t.valueWei, maxCostWei: t.valueWei + t.maxFeePerGas * t.gasLimit };
  }
  throw new ChainsigError('SIG_MISMATCH', `the MPC signature does not recover to the desk address ${deskAddress ?? '(unknown)'}`);
}
