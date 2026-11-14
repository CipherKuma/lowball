import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { BuyerId, ErrorCode } from '../../../shared/api';
import type { Line } from '../lib/state';
import { Slam } from './table/Slam';
import { Tally } from './table/Tally';

export type BondState = 'pending' | 'posted' | 'slashed' | 'immune' | 'kept';
export type Outcome = { kind: 'confessed' } | { kind: 'refused'; code?: ErrorCode } | null;

export const TITLES: Record<BuyerId, string> = {
  marlow: 'Harbour boss',
  odile: 'Cannery books',
  sully: 'Dock buyer',
  ines: 'Restaurateur',
  deacon: 'Middleman',
};

const TILTS = [-1.8, 1.2, -0.6, 1.9, -1.3];
const REFUSAL: Partial<Record<ErrorCode, string>> = {
  E_ALREADY_CONFESSED: 'too late · someone talked first',
};

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
  /** latest OutLayer TDX attestation for an act this buyer signed inside the enclave */
  teeUrl?: string;
  /** pressure from interrogations, 0..6 */
  pressure?: number;
  /** when set, clicking the poster opens the back room for this buyer */
  onLean?: () => void;
  /** lots this buyer has won this season */
  wins?: number;
  /** typed note pinned to the poster when the back room is shut ("back room closed till tomorrow") */
  closedNote?: string;
}

function bondText(bond: BondState, near: string) {
  switch (bond) {
    case 'pending':
      return 'bond not posted yet';
    case 'posted':
      return `${near} Ⓝ held by the contract`;
    case 'slashed':
      return `${near} Ⓝ slashed · paid to you`;
    case 'immune':
      return `${near} Ⓝ returned · immune`;
    case 'kept':
      return `${near} Ⓝ returned`;
  }
}

/** True for a few seconds after this buyer says something, so the poster lifts toward the dispatch slip. */
function useSpeaking(line: Line | undefined) {
  const [seq, setSeq] = useState<number | null>(null);
  useEffect(() => {
    if (!line) return;
    setSeq(line.seq);
    const t = window.setTimeout(() => setSeq(null), Math.min(6000, 2400 + line.text.length * 40));
    return () => window.clearTimeout(t);
  }, [line]);
  return seq !== null;
}

/** A buyer's wanted poster pinned to the wall above the desk. */
export function BuyerCard(p: BuyerCardProps) {
  const still = useReducedMotion();
  const speaking = useSpeaking(p.line);
  const cracked = p.outcome?.kind === 'confessed' || p.bond === 'slashed' || (p.pressure ?? 0) >= 3;
  const first = p.name.split(' ')[0] === 'The' ? p.name : p.name.split(' ')[0];
  const tilt = TILTS[p.index % TILTS.length];
  return (
    <motion.article
      className="poster-slot"
      data-bond={p.bond}
      data-outcome={p.outcome?.kind}
      data-deliberating={p.deliberating || undefined}
      data-speaking={speaking || undefined}
      data-leanable={p.onLean ? true : undefined}
      initial={still ? false : { opacity: 0, y: -14, rotate: tilt * 2 }}
      animate={p.outcome?.kind === 'refused' && !still ? { opacity: 1, y: 0, rotate: 0, x: [0, -6, 5, -3, 2, 0] } : { opacity: 1, y: 0, rotate: 0, x: 0 }}
      transition={{ delay: 0.05 + p.index * (0.075 - p.index * 0.008), duration: 0.42, ease: [0.2, 0.9, 0.25, 1.15] }}
      aria-label={`${p.name}, ${TITLES[p.id]}`}
    >
      <figure className="poster pin" style={{ ['--tilt' as string]: `${tilt}deg` }}>
        <p className="poster-wanted stencil" aria-hidden>
          Wanted
        </p>
        <div className="poster-frame">
          <img className="poster-photo" src={`/art/${p.id}_calm.webp`} alt="" draggable={false} />
          <img
            className="poster-photo poster-photo--cracked"
            src={`/art/${p.id}_cracked.webp`}
            alt=""
            draggable={false}
            style={{ opacity: cracked ? 1 : 0 }}
          />
          {p.deliberating && (
            <span className="poster-deciding typed" aria-label="Deciding">
              deciding<i>.</i>
              <i>.</i>
              <i>.</i>
            </span>
          )}
          {p.isWinner && <span className="poster-took typed">took today's lot</span>}
          <div className="poster-stamps">
            {p.outcome?.kind === 'confessed' && (
              <Slam tone="verified" angle={-9}>
                Confessed
              </Slam>
            )}
            {p.bond === 'slashed' && (
              <Slam angle={7} delay={0.25}>
                Slashed
              </Slam>
            )}
          </div>
        </div>
        <figcaption>
          <h3 className="poster-name">{p.name}</h3>
          <p className="poster-role">{TITLES[p.id]}</p>
          <dl className="poster-tallies">
            <div>
              <dt>Lots won</dt>
              <dd>
                <Tally n={p.wins ?? 0} label="Lots won" />
              </dd>
            </div>
            <div>
              <dt>Pressure</dt>
              <dd>
                <Tally n={p.pressure ?? 0} max={6} label="Pressure" />
              </dd>
            </div>
          </dl>
          <p className="poster-bond typed" title="Bond held by the Lowball contract on NEAR">
            {bondText(p.bond, p.bondNear)}
          </p>
          {p.outcome?.kind === 'refused' && (
            <p className="poster-refused typed">
              confession refused · {REFUSAL[p.outcome.code as ErrorCode] ?? p.outcome.code ?? 'rejected on NEAR'}
            </p>
          )}
          {p.closedNote && <p className="poster-note typed">{p.closedNote}</p>}
        </figcaption>
      </figure>
      <AnimatePresence>
        {speaking && p.line && (
          <motion.p
            key={p.line.seq}
            className="poster-said spoken"
            data-mood={p.line.mood}
            initial={still ? false : { opacity: 0, y: -10, rotate: -4 }}
            animate={{ opacity: 1, y: 0, rotate: tilt * -0.8 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.18 } }}
            transition={{ duration: 0.32, ease: [0.2, 0.9, 0.25, 1.15] }}
            aria-hidden
          >
            “{p.line.text}”
          </motion.p>
        )}
      </AnimatePresence>
      {p.onLean && (
        <button className="poster-lean" onClick={p.onLean} aria-label={`Lean on ${p.name}`}>
          <span className="poster-lean-tag" aria-hidden>
            Lean on {first} <b>→</b>
          </span>
        </button>
      )}
      {p.teeUrl && (
        <a
          className="poster-tee typed"
          href={p.teeUrl}
          target="_blank"
          rel="noreferrer"
          title="This buyer's last signature was made inside an Intel TDX enclave on OutLayer. Open the attestation."
        >
          signed in enclave ↗
        </a>
      )}
    </motion.article>
  );
}
