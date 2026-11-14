import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { BuyerId } from '../../../../shared/api';
import { RING } from './ring';

// Hand-pinned round the bill: two on the left, three on the right (the Deacon tucked low). x, y and w are
// fractions of that side's free board; on phones the posters become one scrolling row instead.
const SPOTS: Record<BuyerId, { side: 'l' | 'r'; x: number; y: number; w: number; tilt: number }> = {
  marlow: { side: 'l', x: 0.36, y: 0.03, w: 0.5, tilt: -3 },
  odile: { side: 'l', x: 0.1, y: 0.47, w: 0.5, tilt: 2.5 },
  sully: { side: 'r', x: 0.1, y: 0.0, w: 0.47, tilt: 2 },
  ines: { side: 'r', x: 0.46, y: 0.3, w: 0.46, tilt: -2.5 },
  deacon: { side: 'r', x: 0.08, y: 0.58, w: 0.4, tilt: 1.5 },
};

/** The buyers pinned to the board. Hover or focus one and they mutter a line from a real season. */
export function Wall({ focus, onFocus }: { focus: BuyerId | null; onFocus: (b: BuyerId | null) => void }) {
  const still = useReducedMotion();
  return (
    <section className="ring-wall" aria-label="The ring: five buyers">
      {RING.map((b, i) => {
        const s = SPOTS[b.id];
        const on = focus === b.id;
        return (
          <motion.button
            key={b.id}
            type="button"
            className="wall-poster"
            data-side={s.side}
            data-on={on || undefined}
            style={{ ['--x' as string]: s.x, ['--y' as string]: s.y, ['--w' as string]: s.w, zIndex: on ? 6 : 1 }}
            onMouseEnter={() => onFocus(b.id)}
            onMouseLeave={() => onFocus(null)}
            onFocus={() => onFocus(b.id)}
            onBlur={() => onFocus(null)}
            aria-label={`${b.name}, ${b.role}: “${b.line}”`}
            initial={still ? { rotate: s.tilt } : { opacity: 0, y: -12, rotate: s.tilt - 5 }}
            animate={{ opacity: 1, y: on ? -5 : 0, rotate: on ? 0 : s.tilt }}
            transition={{ delay: still ? 0 : 0.3 + i * 0.08, duration: 0.42, ease: [0.2, 0.9, 0.25, 1.15] }}
          >
            <figure className="poster pin wall-paper">
              <p className="sign wall-head">Wanted</p>
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
