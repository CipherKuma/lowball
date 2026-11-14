import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { BuyerId, BuyerInfo } from '../../../../shared/api';
import type { View } from '../../lib/state';
import type { Pending } from '../../lib/useGame';
import { Envelope } from '../ui/Envelope';

const TILT = [-3, 1.5, -1, 2.5, -2];
const short = (name: string) => (name.split(' ')[0] === 'The' ? name.split(' ').slice(0, 2).join(' ') : name.split(' ')[0]);

/** Five kraft envelopes on the desk: they arrive face down as each buyer seals, then slit open together. */
export function Envelopes({ buyers, view, pending }: { buyers: BuyerInfo[]; view: View; pending: Pending }) {
  const still = useReducedMotion();
  const reveals = view.reveals;
  const open = !!reveals;
  const amount = (id: BuyerId) => reveals?.find((r) => r.buyer === id)?.amount;
  const sealed = buyers.filter((b) => view.committed[b.id]).length;
  const winner = view.settled?.winner ?? null;
  const best = reveals ? Math.max(...reveals.map((r) => r.amount)) : null;
  const winnerName = winner ? buyers.find((b) => b.id === winner)?.name : null;

  let note: string;
  if (!view.lot) note = 'No lot on the zinc yet.';
  else if (open && view.identical) note = 'Five envelopes. One number.';
  else if (open && view.settled) note = `Sold to ${winnerName ?? 'nobody'} at ${view.settled.price} marks.`;
  else if (open) note = `Best bid ${best} marks.`;
  else if (pending === 'sell') note = 'Slitting the envelopes…';
  else if (pending === 'hold') note = 'Sending the envelopes back. They will bid again.';
  else if (sealed === 0) note = 'The buyers are deciding…';
  else if (sealed < 5) note = `The buyers are sealing their bids · ${sealed} of 5 in`;
  else note = 'Five bids, sealed. Open them when you are ready to sell.';

  return (
    <section className="bids" data-tour="envelopes" data-open={open || undefined} aria-label="Sealed bids">
      <div className="bids-row">
        {buyers.map((b, i) => {
          const committed = !!view.committed[b.id] || open;
          const n = amount(b.id);
          return (
            <div className="bid-slot" key={b.id}>
              <AnimatePresence initial={false}>
                {committed ? (
                  <motion.div
                    key={`${view.lot?.day}-${b.id}`}
                    className="bid-env"
                    style={{ ['--t' as string]: `${TILT[i]}deg` }}
                    initial={still ? false : { opacity: 0, x: -48, y: -10, rotate: -12 }}
                    animate={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
                    exit={{ opacity: 0, y: 8, transition: { duration: 0.16 } }}
                    transition={{ duration: 0.4, ease: [0.2, 0.9, 0.25, 1.15] }}
                  >
                    <Envelope open={open} from={short(b.name)}>
                      <span className="bid-card" data-winner={winner === b.id || undefined}>
                        <b className="sign">{n ?? ''}</b>
                        <small className="typed">marks</small>
                        {open && view.identical && (
                          <svg className="bid-ring" viewBox="0 0 100 60" aria-hidden preserveAspectRatio="none">
                            <motion.path
                              d="M14 32 C 12 10, 86 6, 90 28 C 94 50, 22 58, 10 36 C 8 26, 30 14, 52 12"
                              initial={{ pathLength: still ? 1 : 0 }}
                              animate={{ pathLength: 1 }}
                              transition={{ duration: 0.45, delay: 0.75 + i * 0.06, ease: [0.23, 1, 0.32, 1] }}
                            />
                          </svg>
                        )}
                      </span>
                    </Envelope>
                    {winner === b.id && <span className="bid-took typed">took the lot</span>}
                  </motion.div>
                ) : (
                  <div className="bid-waiting" key="empty" style={{ ['--t' as string]: `${TILT[i]}deg` }} role="img" aria-label={`${b.name} has not bid yet`}>
                    <Envelope open={false} from={short(b.name)}>
                      <span />
                    </Envelope>
                    {view.lot && <span className="bid-waiting-note typed">writing…</span>}
                  </div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
      <p className="bids-note typed" data-tone={open && view.identical ? 'alarm' : undefined} role="status">
        {note}
      </p>
    </section>
  );
}
