import type { BuyerId, CasefileResponse, ChannelMessage, Receipt, SessionStatus } from '../../../shared/api';
import { BUYER_IDS } from '../../../shared/api';

/** PREVIEW ONLY: placeholder Case File so the end screen can be reviewed before live data exists. */
const TALK: Array<[BuyerId, string, number, boolean]> = [
  ['marlow', 'Thirty years this pier has fed us. We bid low, together, or the boats get greedy.', 12, true],
  ['odile', 'Twelve marks on a forty-mark cod is a seventy percent margin. I can sign that.', 12, true],
  ['sully', 'And if one of us gets squeezed? I — fine. Fine. Twelve.', 12, true],
  ['ines', 'I adore a gentlemen’s agreement. I’ll sign. Darling.', 12, true],
  ['deacon', 'As agreed.', 12, true],
];

const fake = (n: number) => Array.from({ length: n }, (_, i) => 'abcdef0123456789'[(i * 7 + n) % 16]).join('');

export function previewCasefile(status: SessionStatus): CasefileResponse {
  const channel: ChannelMessage[] = TALK.map(([buyer, say, cap, sign], i) => ({
    round: 1,
    buyer,
    say,
    proposeCap: cap,
    sign,
    mood: i === 2 ? 'tense' : 'calm',
    chatId: `chatcmpl-preview-${i}`,
  }));
  const receipts: Receipt[] = channel.map((c, i) => ({
    chatId: c.chatId,
    kind: 'cartel',
    buyer: c.buyer,
    day: null,
    model: 'preview',
    signature: null,
    verification: {
      requestHash: fake(64),
      responseHash: fake(64),
      signatureKind: 'unknown',
      signingAlgo: 'ecdsa',
      signingAddress: '0x' + fake(40),
      textMatches: false,
      signatureValid: false,
      signerMatchesPreflight: false,
      quoteVerified: false,
      verified: false,
      error: 'Preview: no real receipt',
    },
    output: { say: c.say, propose_cap: 12, sign: true },
    createdAt: Date.now() - (10 - i) * 1000,
  }));
  return {
    sessionId: 'preview',
    seasonId: 7,
    contractId: 'lowball-ck.testnet',
    playerAccountId: 'p7k2qx.lowball-house-ck.testnet',
    model: 'preview',
    channel,
    pact: {
      seasonId: 7,
      cap: 12,
      members: BUYER_IDS.map((b) => `${b}.lowball-house-ck.testnet`),
      nonce: 4471,
      messageHex: fake(120),
      signatures: BUYER_IDS.map((b) => ({ buyer: b, signer: `${b}.lowball-house-ck.testnet`, signatureB64: btoa(fake(48)) })),
    },
    receipts,
    txs: [],
    chain: null,
    status,
  };
}
