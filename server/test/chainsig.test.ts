import { secp256k1 } from '@noble/curves/secp256k1';
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/chainsig-payout.json';
import { assembleSigned } from '../src/chainsig/assemble.js';
import { addressFromPubkey64, deriveDeskAddress, deriveNearKey, eip55, parseNearSecp256k1 } from '../src/chainsig/derive.js';
import { rlpDecode, rlpEncode } from '../src/chainsig/rlp.js';
import { keccak, parseUnsigned, serializeSigned, signingPreimage } from '../src/chainsig/tx.js';
import { ChainsigError, type DeskPayout } from '../src/chainsig/types.js';
import { fromHex, toHex, utf8 } from '../src/near/bytes.js';

const payout = fixture.payout as DeskPayout;

// Recorded 2026-11-14 from testnet: public_key{domain_id:0} and derived_public_key for
// predecessor desk.lowball-ck.testnet, path lowball-desk-v1 (v1.signer-prod.testnet 3.19.0).
const ROOT = 'secp256k1:4NfTiv3UsGahebgTaHyD9vF8KYKMBnfd6kh94mK6xv8fGBiJB8TBtFMP5WWXz6B89Ac1fbpzPwAvoyQebemHFwx3';
const DERIVED = 'secp256k1:32U3y3tEMHj8zyv9ZJegkoDRFtEyHuWwT59cqXN2zstZuCErJMHhcDn1HMH1mK1dwsTTVQoNZ9fBJQ4JC3bhkJA9';

describe('rlp', () => {
  it('matches the Ethereum wiki vectors and round-trips', () => {
    expect(toHex(rlpEncode(utf8('dog')))).toBe('83646f67');
    expect(toHex(rlpEncode([]))).toBe('c0');
    expect(toHex(rlpEncode([utf8('cat'), utf8('dog')]))).toBe('c88363617483646f67');
    const long = new Uint8Array(300).fill(7);
    expect(toHex(rlpEncode(long).slice(0, 3))).toBe('b9012c');
    const nested = [utf8('a'), [utf8('bc'), []], long];
    expect(toHex(rlpEncode(rlpDecode(rlpEncode(nested))))).toBe(toHex(rlpEncode(nested)));
    expect(() => rlpDecode(Uint8Array.of(0x83, 1))).toThrow(/truncated/);
  });
});

describe('EIP-1559 transfer', () => {
  it('parses the desk preimage and re-serialises it identically', () => {
    const t = parseUnsigned(payout.unsigned_tx);
    expect(t).toMatchObject({ chainId: 11155111n, nonce: 7n, gasLimit: 21000n, valueWei: 200000000000000n, to: payout.to });
    expect(`0x${toHex(signingPreimage(t))}`).toBe(payout.unsigned_tx);
    expect(`0x${toHex(keccak(signingPreimage(t)))}`).toBe(payout.digest);
  });
  it('rejects transactions carrying calldata', () => {
    const hex = payout.unsigned_tx.replace(/80c0$/, '01c0'); // data = 0x01
    expect(() => parseUnsigned(hex)).toThrow();
  });
});

describe('address derivation', () => {
  it('derives the live testnet key from the MPC root key (matches derived_public_key)', () => {
    const d = deriveNearKey(ROOT, 'desk.lowball-ck.testnet', 'lowball-desk-v1');
    expect(Array.from(d)).toEqual(Array.from(parseNearSecp256k1(DERIVED)));
    expect(deriveDeskAddress(ROOT, 'desk.lowball-ck.testnet')).toBe(addressFromPubkey64(parseNearSecp256k1(DERIVED)));
    expect(deriveDeskAddress(ROOT, 'desk.lowball-ck.testnet')).toBe('0x1CE8073F6eFe75470b199aCf8b54532B4c499024');
  });
  it('is per predecessor and per path', () => {
    const a = deriveDeskAddress(ROOT, 'desk.lowball-ck.testnet');
    expect(deriveDeskAddress(ROOT, 'other.testnet')).not.toBe(a);
    expect(deriveDeskAddress(ROOT, 'desk.lowball-ck.testnet', 'other-path')).not.toBe(a);
  });
  it('checksums per EIP-55 reference vectors', () => {
    for (const a of ['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359']) {
      expect(eip55(a.toLowerCase())).toBe(a);
    }
    expect(() => eip55('0x1234')).toThrow();
  });
});

describe('assembleSigned', () => {
  it('reproduces the oracle signed transaction byte for byte', () => {
    const a = assembleSigned(payout, fixture.deskAddress);
    expect(a.rawHex).toBe(fixture.signedRaw);
    expect(a.from).toBe(fixture.deskAddress);
    expect(a.maxCostWei).toBe(200000000000000n + 30000000000n * 21000n);
    expect(a.txHash).toBe(`0x${toHex(keccak(fromHex(fixture.signedRaw)))}`);
  });
  it('normalises a high-s signature (EIP-2) to the same low-s transaction', () => {
    const n = secp256k1.CURVE.n;
    const highS = `0x${(n - BigInt(payout.s!)).toString(16).padStart(64, '0')}`;
    // Flipping s flips the recovery parity, as an MPC response without low-s normalisation would.
    const a = assembleSigned({ ...payout, s: highS, recovery_id: 1 }, fixture.deskAddress);
    expect(a.rawHex).toBe(fixture.signedRaw);
  });
  it('also works when the MPC recovery id is wrong, as long as the key matches', () => {
    expect(assembleSigned({ ...payout, recovery_id: 1 }, fixture.deskAddress).rawHex).toBe(fixture.signedRaw);
  });
  it('refuses a signature that does not recover to the desk address', () => {
    expect(() => assembleSigned(payout, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).toThrow(/does not recover/);
  });
  it('refuses a tampered recipient, amount, digest, chain or unsigned record', () => {
    const bad = (p: Partial<DeskPayout>) => () => assembleSigned({ ...payout, ...p }, fixture.deskAddress);
    expect(bad({ to: '0x000000000000000000000000000000000000dead' })).toThrow(ChainsigError);
    expect(bad({ amount_wei: '200000000000001' })).toThrow(/differ/);
    expect(bad({ digest: `0x${'00'.repeat(32)}` })).toThrow(/digest/);
    expect(bad({ status: 'Pending', big_r: null, s: null, recovery_id: null })).toThrow(/not signed/);
    const mainnet = payout.unsigned_tx.replace('83aa36a7', '01');
    expect(bad({ unsigned_tx: mainnet })).toThrow();
  });
  it('serialises r and s without leading zeros', () => {
    const r = new Uint8Array(32);
    r[31] = 5;
    const s = new Uint8Array(32).fill(1);
    const raw = serializeSigned(parseUnsigned(payout.unsigned_tx), 1, r, s);
    expect(toHex(raw)).toContain('0105a0' + '01'.repeat(32));
  });
});
