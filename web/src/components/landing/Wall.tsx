import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { BuyerId } from '../../../../shared/api';
import { RING } from './ring';

// Hand-pinned, not gridded: each poster has its own place, size and tilt on the shed wall.
const SPOTS: Record<BuyerId, { x: number; y: number; w: number; tilt: number }> = {
  marlow: { x: 1, y: 3, w: 27, tilt: -3.5 },
  odile: { x: 36, y: 0, w: 26, tilt: 2.5 },
  sully: { x: 70, y: 5, w: 27, tilt: -1.5 },
  ines: { x: 13, y: 51, w: 27, tilt: 3 },
  deacon: { x: 52, y: 49, w: 28, tilt: -2.5 },
};

/** The buyers pinned to the shed wall. Hover or focus one and they mutter a line from a real season. */
export function Wall({ focus, onFocus }: { focus: BuyerId | null; onFocus: (b: BuyerId | null) => void }) {
  const still = useReducedMotion();
  return (
    <section className="wall" aria-label="The ring: five buyers">
      {RING.map((b, i) => {
        const s = SPOTS[b.id];
        const on = focus === b.id;
        return (
          <motion.button
            key={b.id}
            type="button"
            className="wall-poster"
            data-on={on || undefined}
            style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, zIndex: on ? 6 : 1 }}
            onMouseEnter={() => onFocus(b.id)}
            onMouseLeave={() => onFocus(null)}
            onFocus={() => onFocus(b.id)}
            onBlur={() => onFocus(null)}
            aria-label={`${b.name}, ${b.role}: “${b.line}”`}
            initial={still ? { rotate: s.tilt } : { opacity: 0, y: -24, rotate: s.tilt - 6 }}
            animate={{ opacity: 1, y: on ? -6 : 0, rotate: on ? 0 : s.tilt }}
            transition={{ delay: still ? 0 : 0.35 + i * 0.09, duration: 0.55, ease: [0.2, 0.9, 0.25, 1.15] }}
          >
            <figure className="poster pin wall-paper">
              <p className="stencil wall-head">The ring</p>
              <img className="poster-photo" src={`/art/${b.id}_${on ? 'cracked' : 'calm'}.webp`} alt="" />
              <figcaption>
                <p className="poster-name">{b.name}</p>
                <p className="poster-role">{b.role}</p>
              </figcaption>
            </figure>
            <AnimatePresence>
              {on && (
                <motion.p
                  className="wall-line spoken"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                >
                  “{b.line}”
                </motion.p>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </section>
  );
}
