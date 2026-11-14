import { AnimatePresence, motion } from 'motion/react';
import type { BuyerId } from '../../../../shared/api';
import { Envelope } from '../ui/Envelope';
import { Stamp } from '../ui/Stamp';
import type { Lit } from './steps';

export const RING: { id: BuyerId; name: string; role: string }[] = [
  { id: 'marlow', name: 'Marlow Teague', role: 'Harbour boss' },
  { id: 'odile', name: 'Odile Fenn', role: 'Cannery books' },
  { id: 'sully', name: 'Sully Brack', role: 'Dock buyer' },
  { id: 'ines', name: 'Ines Varga', role: 'Restaurateur' },
  { id: 'deacon', name: 'The Deacon', role: 'Middleman' },
];
const TILT = [-2, 1.5, -1, 2, -1.5];

interface Props {
  lit: Lit;
  sold: boolean;
  days: number;
  pressure: number;
  offer: 'none' | 'counting' | 'done';
  blocks: number;
  canSell: boolean;
  canLean: boolean;
  canOffer: boolean;
  onSell: () => void;
  onLean: (id: BuyerId) => void;
  onOffer: () => void;
}

/** A miniature of the real table, built from the same materials, driven by the walkthrough. */
export function TutorialDesk({ lit, sold, days, pressure, offer, blocks, canSell, canLean, canOffer, onSell, onLean, onOffer }: Props) {
  const on = (k: Lit) => (lit === k ? true : undefined);
  return (
    <div className="tdesk">
      <section className="tdesk-wall" data-lit={on('buyers')} aria-label="The buyers">
        {RING.map((b, i) => {
          const confessed = offer === 'done' && b.id === 'sully';
          const slashed = offer === 'done' && b.id !== 'sully';
          return (
            <button
              key={b.id}
              className="poster-hit tdesk-poster"
              data-lit={b.id === 'sully' ? on('sully') : undefined}
              onClick={() => onLean(b.id)}
              disabled={!canLean}
              aria-label={`Lean on ${b.name}`}
            >
              <figure className="poster pin" style={{ ['--tilt' as string]: `${TILT[i]}deg`, margin: 0 }}>
                <img className="poster-photo" src={`/art/${b.id}_${b.id === 'sully' && pressure >= 2 ? 'cracked' : 'calm'}.webp`} alt="" />
                <figcaption>
                  <p className="poster-name">{b.name}</p>
                  <p className="poster-role">{b.role}</p>
                </figcaption>
                {confessed && <Stamp tone="verified" angle={-10} className="tdesk-poster-stamp">Confessed</Stamp>}
                {slashed && <Stamp angle={8} delay={0.1 + i * 0.08} className="tdesk-poster-stamp">Slashed</Stamp>}
              </figure>
            </button>
          );
        })}
      </section>

      <div className="tdesk-row">
        <section className="slate tdesk-slate" data-lit={on('slate')} aria-label="Today's lot">
          <p className="stencil chalk-dim tdesk-slate-day">Day {days === 0 ? 1 : days}</p>
          <p className="sign chalk tdesk-slate-species">Bluefin tuna</p>
          <img className="tdesk-fish" src="/art/fish_bluefin.webp" alt="" />
          <dl className="tdesk-slate-facts">
            <div><dt className="chalk-dim">Board price</dt><dd className="sign chalk">120 <small>marks</small></dd></div>
            <div><dt className="chalk-dim">Haul</dt><dd className="sign chalk">96 <small>kg</small></dd></div>
            <div><dt className="chalk-dim">Waves</dt><dd className="sign chalk">0.4 <small>m</small></dd></div>
          </dl>
        </section>

        <section className="tdesk-bids" data-lit={on('envelopes')} aria-label="Sealed bids">
          {RING.map((b) => (
            <Envelope key={b.id} open={sold} from={b.name.replace('The ', '')}>
              <span className="sign tdesk-bid">60</span>
            </Envelope>
          ))}
          <AnimatePresence>
            {sold && (
              <motion.p className="tdesk-bids-note spoken" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
                Five envelopes. One number.
              </motion.p>
            )}
          </AnimatePresence>
        </section>

        <section className="paper paper--ruled tdesk-ledger" data-lit={on('ledger')} aria-label="Your ledger">
          <p className="label">Your ledger</p>
          <ol className="typed tdesk-ledger-rows">
            {days >= 1 && <li><span>Day 1</span><span>sold 60</span><span className="tdesk-taken">−60</span><Stamp angle={-6} className="tdesk-ev">Evidence</Stamp></li>}
            {days >= 2 && <li><span>Day 2</span><span>sold 60</span><span className="tdesk-taken">−60</span><Stamp angle={5} className="tdesk-ev">Evidence</Stamp></li>}
            {offer === 'done' && <li className="tdesk-payout"><span>Bonds</span><span>4 slashed</span><span>+0.20 Ⓝ</span></li>}
          </ol>
          {days === 0 && <p className="typed tdesk-empty">Nothing sold yet.</p>}
        </section>
      </div>

      <div className="tdesk-actions">
        <span data-lit={on('sell')}>
          <button className="plaque" onClick={onSell} disabled={!canSell}>Open the bids &amp; sell</button>
        </span>
        <span data-lit={on('leniency')}>
          <button className="plaque plaque--stamp" onClick={onOffer} disabled={!canOffer}>Offer leniency</button>
          <span className="plaque-note">
            {offer === 'counting' ? `The window closes in ${blocks} blocks` : days >= 2 ? 'Your case is on the record' : `build your case first · ${Math.min(days, 2)} of 2 evidence days`}
          </span>
        </span>
      </div>
    </div>
  );
}
