import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { shortAddress } from '../lib/evm';
import { Stamp } from './ui/Stamp';

export type IdentityStatus = 'idle' | 'connecting' | 'signing' | 'ready' | 'error';

interface Props {
  status: IdentityStatus;
  accountId: string | null;
  error: string | null;
  starting: boolean;
  onConnect: () => void;
  onJudgeDemo: () => void;
  onDisconnect: () => void;
  onBegin: () => void;
  payout: { address: string | null; busy: boolean; error: string | null; onConnect: () => void; onClear: () => void };
}

/** The harbour licence: your own NEAR wallet signs you in, then you choose where the winnings go. */
export function Identity({ status, accountId, error, starting, onConnect, onJudgeDemo, onDisconnect, onBegin, payout }: Props) {
  const still = useReducedMotion();
  const busy = status === 'connecting' || status === 'signing';
  const licensed = status === 'ready' && accountId;

  return (
    <main className="idesk">
      <div className="lamp-pool" style={{ ['--lx' as string]: '50%', ['--ly' as string]: '26%' }} aria-hidden />
      <header className="idesk-head">
        <p className="stencil idesk-kicker">Harbour office · before dawn</p>
        <h1 className="sign idesk-title">{licensed ? 'Your licence' : "Who's selling today?"}</h1>
      </header>

      <motion.section
        className="paper idesk-doc idesk-licence-doc"
        initial={still ? false : { opacity: 0, y: -14, rotate: -2 }}
        animate={{ opacity: 1, y: 0, rotate: -0.6 }}
        transition={{ duration: 0.5, ease: [0.2, 0.9, 0.25, 1.15] }}
        aria-labelledby="idesk-wallet"
      >
        <p className="label">Harbour licence · NEAR testnet</p>
        <h2 id="idesk-wallet" className="sign idesk-doc-title">Your NEAR wallet</h2>
        <ul className="idesk-lines typed">
          <li>You sign the leniency offer yourself, in your wallet.</li>
          <li>Slashed bonds are paid to your own account.</li>
          <li>Signing in is a free message, not a transaction.</li>
        </ul>

        <AnimatePresence mode="wait" initial={false}>
          {licensed ? (
            <motion.div key="ok" className="idesk-licence" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p className="label">Licensed to</p>
              <p className="data idesk-account">{accountId}</p>
              <Stamp tone="verified" angle={-8} className="idesk-stamp">Licensed</Stamp>
              <div className="idesk-actions">
                <button className="plaque" onClick={onBegin} disabled={starting}>{starting ? 'Rowing in…' : 'Start the season'}</button>
                <button className="typed-link" onClick={onDisconnect} disabled={starting}>Use a different wallet</button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="ask" className="idesk-actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <button className="plaque" onClick={onConnect} disabled={busy || starting}>
                {status === 'connecting' ? 'Choose your wallet…' : status === 'signing' ? 'Sign in your wallet…' : 'Connect a NEAR wallet'}
              </button>
              <p className="plaque-note" aria-live="polite">
                {status === 'signing' ? 'Sign the harbour book in your wallet. It costs nothing.' : 'Meteor (web or extension), Intear, Nightly or Ledger · NEAR testnet'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        {error && <p className="idesk-error typed" role="alert">{error}</p>}
      </motion.section>

      {licensed && (
        <section className="idesk-payout typed" aria-label="Where your winnings go">
          <span className="label">Payout</span>
          {payout.address ? (
            <>
              <span>
                Slashed bonds go to <b className="data">{shortAddress(payout.address)}</b>, your Ethereum wallet on Sepolia, signed by NEAR Chain Signatures.
              </span>
              <button className="typed-link" onClick={payout.onClear}>Pay me in NEAR instead</button>
            </>
          ) : (
            <>
              <span>Slashed bonds are paid in NEAR to {accountId}. Or take them on Ethereum Sepolia, signed by NEAR Chain Signatures:</span>
              <button className="typed-link" onClick={payout.onConnect} disabled={payout.busy || starting}>
                {payout.busy ? 'Waiting for your Ethereum wallet…' : 'Connect an Ethereum wallet'}
              </button>
            </>
          )}
          {payout.error && <span className="idesk-payout-error" role="alert">{payout.error}</span>}
        </section>
      )}

      <p className="idesk-judge typed">
        Judging without a wallet?{' '}
        <button className="typed-link" onClick={onJudgeDemo} disabled={busy || starting}>Judge demo: no wallet</button>
        <span> · the game opens a throwaway testnet account for this browser; everything else stays on-chain.</span>
      </p>
    </main>
  );
}
