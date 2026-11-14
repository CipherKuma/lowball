import { motion, useReducedMotion } from 'motion/react';
import type { BuyerId } from '../../../shared/api';

const RING: { id: BuyerId; name: string; role: string; tilt: number }[] = [
  { id: 'marlow', name: 'Marlow Teague', role: 'Harbour boss', tilt: -3 },
  { id: 'odile', name: 'Odile Fenn', role: 'Cannery books', tilt: 2.5 },
  { id: 'sully', name: 'Sully Brack', role: 'Dock buyer', tilt: -1.5 },
  { id: 'ines', name: 'Ines Varga', role: 'Restaurateur', tilt: 3 },
  { id: 'deacon', name: 'The Deacon', role: 'Middleman', tilt: -2.5 },
];

const drop = (i: number, still: boolean | null, rot = 0) =>
  still
    ? { style: { rotate: rot } }
    : {
        initial: { opacity: 0, y: -18, rotate: -4 },
        animate: { opacity: 1, y: 0, rotate: rot },
        transition: { delay: 0.15 + i * 0.08, duration: 0.55, ease: [0.2, 0.9, 0.25, 1.15] as const },
      };

/** Landing: the noticeboard on the pier shed wall. One job: get the player to start. */
export function Title({ onStart, onHowTo, starting, tutorialDone }: { onStart: () => void; onHowTo: () => void; starting: boolean; tutorialDone: boolean }) {
  const still = useReducedMotion();
  return (
    <main className="landing">
      <div className="lamp-pool" style={{ ['--lx' as string]: '34%', ['--ly' as string]: '30%' }} aria-hidden />

      <motion.section className="landing-bill paper paper--aged pin" {...drop(0, still, -1)} aria-labelledby="landing-title">
        <p className="stencil landing-kicker">Pier Nine · 4 a.m. fish auction</p>
        <h1 id="landing-title" className="sign landing-word">Lowball</h1>
        <p className="spoken landing-lede">Five buyers. One price. Make one of them talk.</p>
        <ol className="landing-rules typed">
          <li><span>1</span>Sell your catch. Their sealed bids keep coming back identical.</li>
          <li><span>2</span>Lean on a buyer in the back room. Out loud, or typed.</li>
          <li><span>3</span>Offer leniency on NEAR. The first to confess walks free; the rest lose their bonds to you.</li>
        </ol>
        <div className="landing-cta">
          <button className="plaque" onClick={onStart} disabled={starting}>
            {starting ? 'Rowing in…' : tutorialDone ? 'Start the season' : 'Start: learn the ropes'}
          </button>
          {tutorialDone ? (
            <button className="typed-link" onClick={onHowTo}>Replay the walkthrough</button>
          ) : (
            <span className="plaque-note">A one-minute walkthrough first. Skip it any time.</span>
          )}
        </div>
      </motion.section>

      <section className="landing-wall" aria-label="The buyers">
        {RING.map((b, i) => (
          <motion.figure
            key={b.id}
            className="poster pin landing-poster"
            {...drop(i + 1, still, b.tilt)}
          >
            <p className="stencil landing-poster-head">Buyer</p>
            <img className="poster-photo" src={`/art/${b.id}_calm.webp`} alt="" />
            <figcaption>
              <p className="poster-name">{b.name}</p>
              <p className="poster-role">{b.role}</p>
            </figcaption>
          </motion.figure>
        ))}
        <motion.p className="landing-telegram" {...drop(6, still, 1.2)}>
          <span className="telegram-strip">Ring holds at sixty stop sign it or starve stop</span>
        </motion.p>
      </section>

      <footer className="landing-foot typed">
        <span>Buyers think on NEAR AI Cloud</span>
        <span>Every move is a NEAR testnet transaction</span>
        <span>Voices by ElevenLabs</span>
        <span>Sound on · about five minutes</span>
      </footer>
    </main>
  );
}
