import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Stamp } from './ui/Stamp';

export type IdentityStatus = 'idle' | 'connecting' | 'signing' | 'ready' | 'error';

interface Props {
  status: IdentityStatus;
  kind: 'guest' | 'wallet' | null;
  accountId: string | null;
  error: string | null;
  starting: boolean;
  onConnect: () => void;
  onGuest: () => void;
  onDisconnect: () => void;
  onBegin: () => void;
}

const land = (i: number, still: boolean | null) =>
  still
    ? {}
    : {
        initial: { opacity: 0, y: -14, rotate: i ? 2 : -2 },
        animate: { opacity: 1, y: 0, rotate: 0 },
        transition: { delay: 0.1 + i * 0.09, duration: 0.5, ease: [0.2, 0.9, 0.25, 1.15] as const },
      };

/** Who is selling today: your own NEAR wallet, or a dock pass (no wallet, nothing to install). */
export function Identity({ status, kind, accountId, error, starting, onConnect, onGuest, onDisconnect, onBegin }: Props) {
  const still = useReducedMotion();
  const busy = status === 'connecting' || status === 'signing';
  const licensed = kind === 'wallet' && status === 'ready' && accountId;

  return (
    <main className="idesk">
      <div className="lamp-pool" style={{ ['--lx' as string]: '50%', ['--ly' as string]: '26%' }} aria-hidden />
      <header className="idesk-head">
        <p className="stencil idesk-kicker">Harbour office · before dawn</p>
        <h1 className="sign idesk-title">Who's selling today?</h1>
      </header>

      <div className="idesk-docs">
        <motion.section className="paper idesk-doc" {...land(0, still)} aria-labelledby="idesk-wallet">
          <p className="label">Licence</p>
          <h2 id="idesk-wallet" className="sign idesk-doc-title">Your NEAR wallet</h2>
          <ul className="idesk-lines typed">
            <li>You sign the leniency offer yourself.</li>
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
                  <button className="plaque" onClick={onBegin} disabled={starting}>
                    {starting ? 'Rowing in…' : 'Start the season'}
                  </button>
                  <button className="typed-link" onClick={onDisconnect} disabled={starting}>Use a different wallet</button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="ask" className="idesk-actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <button className="plaque" onClick={onConnect} disabled={busy || starting}>
                  {status === 'connecting' ? 'Choose your wallet…' : status === 'signing' ? 'Sign in your wallet…' : 'Connect a NEAR wallet'}
                </button>
                <p className="plaque-note" aria-live="polite">
                  {status === 'signing'
                    ? 'Sign the harbour book in your wallet. It costs nothing.'
                    : 'Meteor (web or extension), Intear, Nightly or Ledger · NEAR testnet'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          {error && kind !== 'guest' && <p className="idesk-error typed" role="alert">{error}</p>}
        </motion.section>

        <motion.section className="paper paper--telegram idesk-doc idesk-doc--pass" {...land(1, still)} aria-labelledby="idesk-pass">
          <p className="label">No install needed</p>
          <h2 id="idesk-pass" className="sign idesk-doc-title">Dock pass</h2>
          <ul className="idesk-lines typed">
            <li>We open a throwaway NEAR testnet account in this browser.</li>
            <li>Every move is still a real on-chain transaction.</li>
            <li>Best for a quick look, judges and first-timers.</li>
          </ul>
          <div className="idesk-actions">
            <button className="ticket" onClick={onGuest} disabled={busy || starting}>
              {starting && kind === 'guest' ? 'Rowing in…' : 'Play without a wallet'}
            </button>
          </div>
          {error && kind === 'guest' && <p className="idesk-error typed" role="alert">{error}</p>}
        </motion.section>
      </div>
    </main>
  );
}
