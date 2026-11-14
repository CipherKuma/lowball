import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import type { BuyerInfo } from '../../../../shared/api';
import type { View } from '../../lib/state';

type Item =
  | { kind: 'line'; seq: number; who: string; text: string; mood: string }
  | { kind: 'recap'; seq: number; text: string };

/** Types the newest slip on in at most 1.2 s. */
function useTyped(text: string, run: boolean) {
  const [n, setN] = useState(run ? 0 : text.length);
  useEffect(() => {
    if (!run || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(text.length);
      return;
    }
    setN(0);
    const step = Math.max(1, Math.ceil(text.length / 48));
    const id = window.setInterval(() => setN((c) => (c >= text.length ? (window.clearInterval(id), c) : c + step)), 25);
    return () => window.clearInterval(id);
  }, [text, run]);
  return text.slice(0, n);
}

function Slip({ item, fresh }: { item: Item; fresh: boolean }) {
  const typed = useTyped(item.text, fresh);
  if (item.kind === 'recap') {
    return (
      <div className="slip slip--telegram paper paper--telegram">
        <span className="label">Harbour dispatch</span>
        <p className="typed slip-telegram">
          <span>{typed}</span>
          <span className="slip-ghost" aria-hidden>
            {item.text}
          </span>
        </p>
      </div>
    );
  }
  return (
    <div className="slip slip--said paper" data-mood={item.mood}>
      <span className="label">{item.who} says</span>
      <p className="spoken slip-said">
        <span>“{typed}”</span>
        <span className="slip-ghost" aria-hidden>
          “{item.text}”
        </span>
      </p>
    </div>
  );
}

/** What reaches the desk: buyer lines as torn slips, harbour news as telegrams, the pier's rumour on top. */
export function Dispatch({ view, buyers }: { view: View; buyers: BuyerInfo[] }) {
  const still = useReducedMotion();
  const items = useMemo<Item[]>(() => {
    const name = (id: string) => buyers.find((b) => b.id === id)?.name ?? id;
    const all: Item[] = [
      ...view.lines.map((l) => ({ kind: 'line' as const, seq: l.seq, who: name(l.buyer), text: l.text, mood: l.mood })),
      ...view.recaps.map((r) => ({ kind: 'recap' as const, seq: r.seq, text: r.text })),
    ];
    return all.sort((a, b) => b.seq - a.seq).slice(0, 3);
  }, [view.lines, view.recaps, buyers]);
  const rumour = view.rumours.at(-1);

  return (
    <section className="desk-dispatch" aria-label="Dispatch" aria-live="polite">
      {rumour && (
        <p className="dispatch-rumour typed">
          <span className="label">On the pier</span> {rumour}
        </p>
      )}
      <div className="dispatch-pile">
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((it, i) => (
            <motion.div
              key={it.seq}
              layout={!still}
              className="dispatch-item"
              data-depth={i}
              initial={still ? false : { opacity: 0, y: -12, rotate: -3 }}
              animate={{ opacity: i === 0 ? 1 : i === 1 ? 0.82 : 0.6, y: 0, rotate: i === 0 ? -0.6 : i === 1 ? 0.8 : -1.2 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 0.36, ease: [0.2, 0.9, 0.25, 1.15] }}
            >
              <Slip item={it} fresh={i === 0} />
            </motion.div>
          ))}
        </AnimatePresence>
        {items.length === 0 && <p className="dispatch-empty typed">No word on the pier yet. Lines from the buyers land here.</p>}
      </div>
    </section>
  );
}
