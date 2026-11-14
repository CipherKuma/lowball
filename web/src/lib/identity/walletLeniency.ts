import type { NearWalletBase } from '@hot-labs/near-connect';
import { looksRejected, sendOfferLeniency, viewSeason } from '../near-connect';

/** What the UI shows while offer_leniency is in flight. */
export type LeniencyState = 'idle' | 'awaiting-wallet' | 'submitted' | 'open' | 'rejected' | 'failed';

export type WalletLeniencyResult =
  | { kind: 'open'; txHash: string | null }
  | { kind: 'rejected' }
  | { kind: 'failed'; message: string };

const POLL_MS = 1500;
/** The player may sit on the wallet prompt for a while; after this we give up waiting. */
const GIVE_UP_MS = 5 * 60_000;

/**
 * offer_leniency leaves a NEP-519 yield pending for ~200 blocks, so a wallet promise that waits for the
 * final outcome can hang long after the window opened. Race the wallet against get_season(...).leniency_open
 * and proceed on whichever shows the window first. awaiting-wallet: prompt up; submitted: the wallet handed
 * back a hash and we wait for the chain; open: the window is live (txHash is null if only the poll saw it).
 */
export async function offerLeniencyWithWallet(
  wallet: NearWalletBase,
  accountId: string,
  contractId: string,
  seasonId: number,
  onState: (s: LeniencyState) => void,
): Promise<WalletLeniencyResult> {
  onState('awaiting-wallet');
  let hash: string | null = null;
  let walletError: unknown = null;
  let walletDone = false;
  const sent = sendOfferLeniency(wallet, accountId, contractId, seasonId).then(
    (out) => {
      walletDone = true;
      hash = out?.transaction?.hash ?? null;
      onState('submitted');
    },
    (e) => {
      walletDone = true;
      walletError = e;
    },
  );
  const isOpen = async () => {
    const v = await viewSeason(contractId, seasonId);
    return !!v && v.leniency_open && v.player === accountId;
  };
  const started = Date.now();
  for (;;) {
    // the wallet either returned (hash) or refused/failed; the poll catches the window before either
    await Promise.race([sent, new Promise((r) => setTimeout(r, POLL_MS))]);
    if (walletDone && walletError !== null) {
      if (await isOpen()) return open(hash as string | null, onState); // the tx landed even though the wallet complained
      if (looksRejected(walletError)) {
        onState('rejected');
        return { kind: 'rejected' };
      }
      onState('failed');
      return { kind: 'failed', message: 'The wallet could not send offer_leniency. Nothing was opened; try again.' };
    }
    if (await isOpen()) return open(hash as string | null, onState);
    if (Date.now() - started > GIVE_UP_MS) {
      onState('failed');
      return { kind: 'failed', message: 'The leniency window never opened. If you approved it, wait a minute and try again.' };
    }
  }
}

function open(txHash: string | null, onState: (s: LeniencyState) => void): WalletLeniencyResult {
  onState('open');
  return { kind: 'open', txHash };
}
