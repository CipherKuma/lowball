import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import type { BuyerId } from '../../../shared/api';
import { Counter } from './landing/Counter';
import { Wall } from './landing/Wall';

interface Props {
  onConnect: () => void;
  onJudgeDemo: () => void;
  onHowTo: () => void;
  starting: boolean;
  tutorialDone: boolean;
  wallet: { status: 'idle' | 'connecting' | 'signing' | 'ready' | 'error'; accountId: string | null; error: string | null };
}

const DROP = [0.2, 0.9, 0.25, 1.15] as const;

/** Landing: the noticeboard on the pier shed. One LOWBALL poster, the ring pinned round it, five sealed bids under it. */
export function Title({ onConnect, onJudgeDemo, onHowTo, starting, tutorialDone, wallet }: Props) {
  const still = useReducedMotion();
  const [focus, setFocus] = useState<BuyerId | null>(null);
  const busy = starting || wallet.status === 'connecting' || wallet.status === 'signing';
  const signedIn = wallet.status === 'ready' && wallet.accountId;
  const label = starting
    ? 'Rowing in…'
    : wallet.status === 'connecting'
      ? 'Choose your wallet…'
      : wallet.status === 'signing'
        ? 'Sign in your wallet…'
        : signedIn
          ? `Continue as ${wallet.accountId}`
          : 'Connect a NEAR wallet';

  return (
    <main className="landing">
      <div className="board-photo" aria-hidden />
      <div className="board-lamp" aria-hidden />

      <div className="board">
        <motion.section
          className="bill paper paper--aged pin"
          aria-labelledby="landing-title"
          initial={still ? false : { opacity: 0, y: -12, rotate: -3 }}
          animate={{ opacity: 1, y: 0, rotate: -1 }}
          transition={{ duration: 0.45, ease: DROP }}
        >
          <p className="sign bill-kicker">Pier Nine · fish auction · 4 a.m.</p>
          <h1 id="landing-title" className="painted" aria-label="Lowball">LOWBALL</h1>
          <p className="spoken bill-lede">
            Five fish buyers rig every auction. You can't outbid a cartel. <em>Make one of them talk.</em>
          </p>

          <div className="bill-cta">
            <button className="plaque landing-connect" onClick={onConnect} disabled={busy} aria-label={label}>{label}</button>
            <p className="bill-help paper paper--telegram typed">
              {wallet.status === 'signing'
                ? 'Sign the harbour book in your wallet. It is a free message, not a transaction.'
                : `Meteor, Intear, Nightly, Ledger, or MetaMask through Ethereum Wallets · NEAR testnet.${tutorialDone ? '' : ' A one-minute walkthrough comes first; skip it any time.'}`}
            </p>
            {wallet.error && <p className="bill-error typed" role="alert">{wallet.error}</p>}
          </div>

          <div className="bill-alt">
            <button className="ticket" onClick={onJudgeDemo} disabled={busy} aria-label="Judge demo: no wallet">Judge demo: no wallet</button>
            <p className="typed bill-alt-note">Nothing to install. The game opens a throwaway testnet account for this browser.</p>
            {tutorialDone && (
              <button className="typed-link" onClick={onHowTo}>Replay the walkthrough</button>
            )}
          </div>
        </motion.section>

        <Wall focus={focus} onFocus={setFocus} />
        <Counter focus={focus} onFocus={setFocus} />
      </div>

      <p className="typed board-credit">NEAR testnet · buyers on NEAR AI Cloud · voices by ElevenLabs</p>
    </main>
  );
}
