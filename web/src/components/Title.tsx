import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import type { BuyerId } from '../../../shared/api';
import { Counter } from './landing/Counter';
import { Osd } from './landing/Osd';
import { Wall } from './landing/Wall';

interface Props {
  onConnect: () => void;
  onJudgeDemo: () => void;
  onHowTo: () => void;
  starting: boolean;
  tutorialDone: boolean;
  wallet: { status: 'idle' | 'connecting' | 'signing' | 'ready' | 'error'; accountId: string | null; error: string | null };
}

const WORD = 'LOWBALL'.split('');

/** Landing: the pier at 4 a.m. through a security camera. The neon sign, the ring on the wall, five envelopes on the zinc. */
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
      <div className="fog fog-a" aria-hidden />
      <div className="fog fog-b" aria-hidden />
      <Osd />

      <div className="landing-stage">
        <section className="landing-left" aria-labelledby="landing-title">
          <motion.p
            className="stencil landing-plank"
            initial={still ? false : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            Pier Nine · fish auction · 4 a.m.
          </motion.p>
          <h1 id="landing-title" className="neon" aria-label="Lowball">
            {WORD.map((ch, i) => (
              <span key={i} className={i === 4 ? 'neon-buzz' : undefined} aria-hidden>
                {ch}
              </span>
            ))}
          </h1>
          <div className="neon-reflect" aria-hidden>LOWBALL</div>
          <motion.p
            className="spoken landing-lede"
            initial={still ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.6 }}
          >
            Five fish buyers rig every auction. You can't outbid a cartel. <em>Make one of them talk.</em>
          </motion.p>

          <motion.div
            className="landing-cta"
            initial={still ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
          >
            <button className="plaque landing-connect" onClick={onConnect} disabled={busy}>{label}</button>
            <p className="landing-cta-note typed">
              {wallet.status === 'signing'
                ? 'Sign the harbour book in your wallet. It is a free message, not a transaction.'
                : `Meteor, Intear, Nightly or Ledger on NEAR testnet.${tutorialDone ? '' : ' A one-minute walkthrough comes first; skip it any time.'}`}
            </p>
            {wallet.error && <p className="landing-error typed" role="alert">{wallet.error}</p>}
            <p className="landing-alt typed">
              <button className="typed-link" onClick={onJudgeDemo} disabled={busy}>Judge demo: no wallet</button>
              <span> · nothing to install; the game opens a throwaway testnet account for this browser.</span>
              {tutorialDone && (
                <>
                  {' '}
                  <button className="typed-link" onClick={onHowTo}>Replay the walkthrough</button>
                </>
              )}
            </p>
          </motion.div>
        </section>

        <Wall focus={focus} onFocus={setFocus} />
      </div>

      <Counter focus={focus} onFocus={setFocus} />
    </main>
  );
}
