// Pre-flight for a Sepolia payout address: can the desk pay it within its MPC-signed gas_limit?
// A transfer to an address that does not exist yet costs ~207k gas (new-account state), far above the
// desk's 21000, so the payout would be mined and revert. A value of 0 does not reproduce it: use 1 wei.
import type { Rpc } from '../near/rpc.js';
import { getConfig, getDerivedAddress } from './desk.js';
import type { EvmRpc } from './evm.js';

export interface PayoutCheck {
  ok: boolean;
  gasNeeded: string;
  gasLimit: string;
  reason?: string;
}

export interface CheckDeps {
  near: Rpc;
  evm: EvmRpc;
  deskId: string;
}

/** Never throws: any RPC or desk-view failure answers ok:true with reason 'unchecked'. */
export async function checkPayoutAddress(to: string, d: CheckDeps): Promise<PayoutCheck> {
  try {
    const cfg = await getConfig(d.near, d.deskId);
    const from = cfg.derived_address ?? (await getDerivedAddress(d.near, d.deskId));
    const limit = BigInt(String(cfg.gas_limit));
    if (!from) throw new Error('no desk address');
    const needed = await d.evm.estimateGas({ from, to, value: '0x1' });
    if (needed <= limit) return { ok: true, gasNeeded: needed.toString(), gasLimit: limit.toString() };
    return {
      ok: false,
      gasNeeded: needed.toString(),
      gasLimit: limit.toString(),
      reason: 'The address does not exist on Sepolia yet; the desk gas limit cannot cover creating it.',
    };
  } catch {
    return { ok: true, gasNeeded: '0', gasLimit: '0', reason: 'unchecked' };
  }
}
