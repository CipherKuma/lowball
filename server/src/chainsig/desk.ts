// NEAR side of the relayer: read the desk's views, and keep its nonce/fee config in step with Sepolia.
import { toB64 } from '../near/bytes.js';
import type { Rpc } from '../near/rpc.js';
import type { NearSigner } from '../near/signer.js';
import type { EvmRpc } from './evm.js';
import { ChainsigError, type DeskPayout } from './types.js';

export async function deskView<T>(near: Rpc, deskId: string, method: string, args: unknown = {}): Promise<T> {
  let r: any;
  try {
    r = await near.call('query', {
      request_type: 'call_function',
      finality: 'optimistic',
      account_id: deskId,
      method_name: method,
      args_base64: toB64(new TextEncoder().encode(JSON.stringify(args))),
    });
  } catch (e) {
    throw new ChainsigError('NEAR_VIEW_FAILED', `desk view ${method}: ${String(e)}`);
  }
  if (r.error) throw new ChainsigError('NEAR_VIEW_FAILED', `desk view ${method} failed: ${String(r.error).slice(0, 200)}`);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(r.result))) as T;
}

export const getPayout = (near: Rpc, deskId: string, seasonId: number) =>
  deskView<DeskPayout | null>(near, deskId, 'get_payout', { season_id: seasonId });

export const getDerivedAddress = (near: Rpc, deskId: string) => deskView<string | null>(near, deskId, 'get_derived_address');

export interface DeskConfig {
  next_nonce: number;
  max_fee_per_gas: string;
  max_priority_fee_per_gas: string;
  derived_address: string | null;
  [k: string]: unknown;
}

export const getConfig = (near: Rpc, deskId: string) => deskView<DeskConfig>(near, deskId, 'get_config');

/**
 * Point the desk at the address's current Sepolia nonce and fees. Call it when no payout is
 * `Pending` (the contract hands out nonces sequentially; a stale nonce would stall every payout).
 * `signer` must be the desk owner (the house account).
 */
export async function syncDesk(near: Rpc, evm: EvmRpc, signer: NearSigner, deskId: string, deskAddress: string) {
  const [nonce, fees] = await Promise.all([evm.getNonce(deskAddress, 'pending'), evm.suggestFees()]);
  const cfg = await getConfig(near, deskId);
  const same = BigInt(cfg.next_nonce) === nonce && BigInt(cfg.max_fee_per_gas) === fees.maxFeePerGas;
  if (same) return { nonce, ...fees, changed: false as const, nearTx: null };
  const args = {
    next_nonce: Number(nonce),
    max_fee_per_gas: fees.maxFeePerGas.toString(),
    max_priority_fee_per_gas: fees.maxPriorityFeePerGas.toString(),
  };
  const res = await signer.send(deskId, [
    { kind: 'functionCall', method: 'prepare', args: new TextEncoder().encode(JSON.stringify(args)), gas: 30_000_000_000_000n, deposit: 0n },
  ]);
  if (!res.ok) throw new ChainsigError('NEAR_VIEW_FAILED', `desk prepare failed: ${res.failure ?? res.errorCode}`);
  return { nonce, ...fees, changed: true as const, nearTx: res.hash };
}
