// Relayer: desk payout record -> signed Sepolia transaction -> broadcast -> receipt.
// Idempotent: the tx hash is known before broadcasting, so a repeat call only reads the receipt.
import type { Rpc } from '../near/rpc.js';
import { assembleSigned } from './assemble.js';
import { getDerivedAddress, getPayout } from './desk.js';
import { EvmRpcError, type EvmRpc } from './evm.js';
import { ChainsigError, type DeskPayout, type RelayResult } from './types.js';

export interface RelayDeps {
  near: Rpc;
  evm: EvmRpc;
  deskId: string;
  /** Override when the desk has not stored its address yet (e.g. computed with deriveDeskAddress). */
  deskAddress?: string;
  /** How long to wait for a `Pending` payout to be signed by the MPC network. */
  waitSignedMs?: number;
  /** How long to wait for the Sepolia receipt before reporting `pending`. */
  waitReceiptMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function waitSigned(seasonId: number, d: RelayDeps): Promise<DeskPayout> {
  const sleep = d.sleep ?? defaultSleep;
  const poll = d.pollMs ?? 2500;
  const deadline = Date.now() + (d.waitSignedMs ?? 60_000);
  for (;;) {
    const p = await getPayout(d.near, d.deskId, seasonId);
    if (!p) throw new ChainsigError('NO_PAYOUT', `the desk has no payout for season ${seasonId}`);
    if (p.status === 'Signed') return p;
    if (p.status === 'Failed') throw new ChainsigError('PAYOUT_FAILED', `signing failed on the desk: ${p.error ?? 'unknown'} (owner can retry_payout)`);
    if (Date.now() >= deadline) throw new ChainsigError('PAYOUT_PENDING', `the MPC signature for season ${seasonId} has not arrived yet`);
    await sleep(poll);
  }
}

export async function relayPayout(seasonId: number, d: RelayDeps): Promise<RelayResult> {
  const sleep = d.sleep ?? defaultSleep;
  const payout = await waitSigned(seasonId, d);
  const deskAddress = d.deskAddress ?? (await getDerivedAddress(d.near, d.deskId));
  const tx = assembleSigned(payout, deskAddress);
  const base = { seasonId, to: payout.to, amountWei: payout.amount_wei, sepoliaTx: tx.txHash };

  let broadcast = false;
  if (!(await d.evm.isKnown(tx.txHash))) {
    const balance = await d.evm.getBalance(tx.from);
    if (balance < tx.maxCostWei) {
      throw new ChainsigError('UNDERFUNDED', `desk address ${tx.from} holds ${balance} wei on Sepolia, needs up to ${tx.maxCostWei}`);
    }
    try {
      const returned = await d.evm.sendRaw(tx.rawHex);
      if (returned.toLowerCase() !== tx.txHash.toLowerCase()) throw new ChainsigError('EVM_REJECTED', `node returned hash ${returned}, expected ${tx.txHash}`);
      broadcast = true;
    } catch (e) {
      if (e instanceof EvmRpcError) {
        if (/already known|known transaction|already imported/i.test(e.message)) {
          // another provider (or an earlier attempt) already has it
        } else if (/nonce too low/i.test(e.message) && !(await d.evm.isKnown(tx.txHash))) {
          throw new ChainsigError('NONCE_TOO_LOW', `nonce ${payout.nonce} is already used on Sepolia: run syncDesk and retry_payout (${e.message})`);
        } else if (/insufficient funds/i.test(e.message)) {
          throw new ChainsigError('UNDERFUNDED', e.message);
        } else if (!/nonce too low/i.test(e.message)) {
          throw new ChainsigError('EVM_REJECTED', e.message);
        }
      } else {
        throw e;
      }
    }
  }

  const deadline = Date.now() + (d.waitReceiptMs ?? 90_000);
  for (;;) {
    const rc = await d.evm.getReceipt(tx.txHash);
    if (rc) return { ...base, status: rc.status, blockNumber: rc.blockNumber, broadcast };
    if (Date.now() >= deadline) return { ...base, status: 'pending', broadcast };
    await sleep(d.pollMs ?? 2500);
  }
}

/** Game event payload for shared/api.ts (`payout_evm`); nearTx is the confess tx the caller knows. */
export function payoutEvmEvent(r: RelayResult, nearTx: string) {
  return { kind: 'payout_evm' as const, to: r.to, amountWei: r.amountWei, sepoliaTx: r.sepoliaTx, nearTx, status: r.status };
}
