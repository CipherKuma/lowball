import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { BuyerId, ErrorCode } from '../../../shared/api';
import type { Line } from '../lib/state';

export type BondState = 'pending' | 'posted' | 'slashed' | 'immune' | 'kept';
export type Outcome = { kind: 'confessed' } | { kind: 'refused'; code?: ErrorCode } | null;

const TITLES: Record<BuyerId, string> = {
  marlow: 'Harbour boss',
  odile: 'Cannery books',
  sully: 'Dock buyer',
  ines: 'Restaurateur',
  deacon: 'Middleman',
};

function useTypewriter(text: string | undefined, speed = 26) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (!text) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setN(text.length);
      return;
    }
    const id = window.setInterval(() => setN((c) => (c >= text.length ? (window.clearInterval(id), c) : c + 1)), speed);
    return () => window.clearInterval(id);
  }, [text, speed]);
  return text ? text.slice(0, n) : '';
}

function Bubble({ line }: { line: Line | undefined }) {
  const [visible, setVisible] = useState<Line | undefined>(undefined);
  useEffect(() => {
    if (!line) return;
    setVisible(line);
    const t = window.setTimeout(() => setVisible(undefined), Math.max(5200, line.text.length * 70));
    return () => window.clearTimeout(t);
  }, [line]);
  const typed = useTypewriter(visible?.text);
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={visible.seq}
          className="bubble"
          data-mood={visible.mood}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.18 } }}
          transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
        >
          <span>{typed}</span>
          <span className="bubble-ghost" aria-hidden>
            {visible.text}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export interface BuyerCardProps {
  id: BuyerId;
  name: string;
  bond: BondState;
  bondNear: string;
  bid: 'none' | 'sealed' | number;
  identical: boolean;
  isWinner: boolean;
  line: Line | undefined;
  deliberating: boolean;
  outcome: Outcome;
  index: number;
}

export function BuyerCard(p: BuyerCardProps) {
  const cracked = p.outcome?.kind === 'confessed' || p.bond === 'slashed';
  const revealed = typeof p.bid === 'number';
  return (
    <motion.article
      className="buyer"
      data-bond={p.bond}
      data-deliberating={p.deliberating || undefined}
      data-outcome={p.outcome?.kind}
      initial={{ opacity: 0, y: 18 }}
      animate={p.outcome?.kind === 'refused' ? { opacity: 1, y: 0, x: [0, -7, 6, -4, 3, 0] } : { opacity: 1, y: 0, x: 0 }}
      transition={{ delay: p.index * 0.07, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      aria-label={`${p.name}, ${TITLES[p.id]}`}
    >
      <Bubble line={p.line} />
      <div className="portrait">
        <img className="portrait-calm" src={`/art/${p.id}_calm.webp`} alt="" draggable={false} />
        <img
          className="portrait-cracked"
          src={`/art/${p.id}_cracked.webp`}
          alt=""
          draggable={false}
          style={{ opacity: cracked ? 1 : 0 }}
        />
        {p.deliberating && <div className="think" aria-label="Deliberating" />}
        <AnimatePresence>
          {p.outcome?.kind === 'confessed' && (
            <motion.div
              className="stamp stamp-immune"
              initial={{ opacity: 0, scale: 1.8, rotate: -14 }}
              animate={{ opacity: 1, scale: 1, rotate: -8 }}
              transition={{ type: 'spring', duration: 0.45, bounce: 0.25 }}
            >
              Immune
            </motion.div>
          )}
          {p.outcome?.kind === 'refused' && (
            <motion.div
              className="stamp stamp-refused"
              initial={{ opacity: 0, scale: 1.8, rotate: 10 }}
              animate={{ opacity: 1, scale: 1, rotate: 6 }}
              transition={{ type: 'spring', duration: 0.45, bounce: 0.2 }}
            >
              Refused
              <small>{p.outcome.code ?? 'rejected on-chain'}</small>
            </motion.div>
          )}
          {p.bond === 'slashed' && p.outcome?.kind !== 'refused' && (
            <motion.div
              className="stamp stamp-slashed"
              initial={{ opacity: 0, scale: 1.6, rotate: 8 }}
              animate={{ opacity: 1, scale: 1, rotate: 4 }}
              transition={{ type: 'spring', duration: 0.45, bounce: 0.2, delay: 0.25 }}
            >
              Slashed
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="buyer-meta">
      <header className="nameplate">
        <h3 className="display">{p.name}</h3>
        <p>{TITLES[p.id]}</p>
      </header>
      <div className="bond" title="Bond held by the Lowball contract">
        <span className="bond-box" aria-hidden />
        <span className="mono">{p.bond === 'pending' ? '—' : `${p.bondNear} Ⓝ`}</span>
        <span className="bond-state">
          {p.bond === 'pending' && 'no bond'}
          {p.bond === 'posted' && 'bonded'}
          {p.bond === 'slashed' && 'lost'}
          {p.bond === 'immune' && 'refunded'}
          {p.bond === 'kept' && 'kept'}
        </span>
      </div>
      </div>
      <div className="bid" data-state={revealed ? 'open' : p.bid} data-identical={(revealed && p.identical) || undefined}>
        <div className="bid-inner" style={{ transform: revealed ? 'rotateY(180deg)' : 'none' }}>
          <div className="bid-face bid-back">
            {p.bid === 'none' ? <span className="bid-empty">no bid</span> : <span className="seal" />}
          </div>
          <div className="bid-face bid-front">
            <span className="mono">{revealed ? p.bid : ''}</span>
            <small>marks</small>
            {p.isWinner && <em className="winner">wins</em>}
          </div>
        </div>
      </div>
    </motion.article>
  );
}
