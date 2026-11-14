import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { BuyerId } from '../../../../shared/api';
import { Envelope } from '../ui/Envelope';
import { RING } from './ring';

const OPEN_AT = 1500;
const STEP = 240;

/** Five sealed bids pinned under the poster: they slit open on their own, all say sixty, a chalk ring closes round them,
 *  and the telegram under them types its verdict. The landing's one orchestrated moment. */
export function Counter({ focus, onFocus }: { focus: BuyerId | null; onFocus: (b: BuyerId | null) => void }) {
  const still = useReducedMotion();
  const [open, setOpen] = useState<Set<BuyerId>>(() => new Set(still ? RING.map((b) => b.id) : []));
  const [ringed, setRinged] = useState(!!still);
  useEffect(() => {
    if (still) return;
    const timers = RING.map((b, i) => window.setTimeout(() => setOpen((o) => new Set(o).add(b.id)), OPEN_AT + i * STEP));
    timers.push(window.setTimeout(() => setRinged(true), OPEN_AT + RING.length * STEP + 450));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [still]);
  const toggle = (id: BuyerId) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <section className="counter" aria-label="This morning's sealed bids">
      <div className="counter-scroll">
        <div className="counter-row">
          {RING.map((b, i) => (
            <motion.button
              key={b.id}
              type="button"
              className="counter-env pin"
              data-focus={focus === b.id || undefined}
              onClick={() => toggle(b.id)}
              onMouseEnter={() => onFocus(b.id)}
              onMouseLeave={() => onFocus(null)}
              onFocus={() => onFocus(b.id)}
              onBlur={() => onFocus(null)}
              aria-label={`${b.name}'s sealed bid: ${open.has(b.id) ? '60 marks' : 'sealed'}`}
              initial={still ? false : { y: -12, opacity: 0, rotate: (i - 2) * 4 }}
              animate={{ y: 0, opacity: 1, rotate: (i - 2) * 1.4 }}
              transition={{ delay: 0.75 + i * 0.07, duration: 0.4, ease: [0.2, 0.9, 0.25, 1.15] }}
            >
              <Envelope open={open.has(b.id)} from={b.short}>
                <span className="counter-card sign">60</span>
              </Envelope>
            </motion.button>
          ))}
          <svg className="counter-ring" viewBox="0 0 1000 160" preserveAspectRatio="none" aria-hidden data-on={ringed || undefined}>
            <path d="M40 96 C 30 20, 320 6, 520 10 C 760 14, 985 30, 968 92 C 952 148, 640 156, 470 152 C 250 148, 52 140, 46 88" />
          </svg>
        </div>
      </div>
      <p className="counter-telegram paper paper--telegram typed">
        <span data-on={ringed || undefined}>Ring holds at sixty stop sign it or starve stop</span>
      </p>
    </section>
  );
}
