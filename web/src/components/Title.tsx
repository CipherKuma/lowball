import { motion } from 'motion/react';

const RULES = [
  ['Five buyers. One price.', 'Every morning they seal their bids. Every morning the number is the same, and it is low.'],
  ['They signed a pact.', 'Each buyer put up a bond and signed a secret agreement with their own key.'],
  ['Make one talk.', 'Take their rigged price long enough to build a case, then offer leniency on NEAR. The first to hand over the signed pact walks free; the rest lose their bonds to you.'],
] as const;

const ease = [0.23, 1, 0.32, 1] as const;

export function Title({ onStart, starting }: { onStart: () => void; starting: boolean }) {
  return (
    <main className="title">
      <div className="title-copy">
        <motion.p
          className="title-kicker"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease, delay: 0.2 }}
        >
          Pier Nine · 4 a.m.
        </motion.p>
        <motion.h1
          className="display"
          initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, ease, delay: 0.3 }}
        >
          Lowball
        </motion.h1>
        <motion.p
          className="title-lede"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease, delay: 0.55 }}
        >
          Five AI fish buyers are rigging your auction. Break the ring by making one of them confess.
        </motion.p>
        <ol className="rules">
          {RULES.map(([h, p], i) => (
            <motion.li
              key={h}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.55, ease, delay: 0.75 + i * 0.12 }}
            >
              <span className="mono">0{i + 1}</span>
              <div>
                <strong>{h}</strong>
                <p>{p}</p>
              </div>
            </motion.li>
          ))}
        </ol>
        <motion.div
          className="title-cta"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease, delay: 1.15 }}
        >
          <button className="btn btn-amber btn-lg" onClick={onStart} disabled={starting}>
            {starting ? 'Rowing in…' : 'Take your catch to market'}
          </button>
          <span className="title-note">Sound on. A season takes about five minutes.</span>
        </motion.div>
        <motion.ul
          className="title-stack"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.4 }}
          aria-label="Built with"
        >
          <li>NEAR testnet contract</li>
          <li>NEAR AI Cloud buyers</li>
          <li>Signed model receipts</li>
          <li>ElevenLabs voices</li>
        </motion.ul>
      </div>
    </main>
  );
}
