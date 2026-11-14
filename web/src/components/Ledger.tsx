import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { SessionStatus } from '../../../shared/api';
import type { View } from '../lib/state';
import { txUrl, yoctoToNear } from '../lib/wallet';
import { Slam } from './table/Slam';

/** Mirrors server CASE_DAYS: leniency unlocks after this many evidence days on record. */
export const CASE_DAYS = 2;

interface Props {
  view: View;
  status: SessionStatus | null;
  days: number;
}

/** The fisher's ruled ledger page: one typed row per day, the running loss, the case, the payout. */
export function Ledger({ view, status, days }: Props) {
  const still = useReducedMotion();
  const caseCount = view.history.filter((h) => h.evidence).length;
  const day = status?.day || view.lot?.day || 0;
  const s = view.slashed;
  return (
    <aside className="ledger paper paper--ruled" data-tour="ledger" aria-label="Your ledger">
      <header className="ledger-head">
        <h2 className="sign">Ledger</h2>
        <p className="stencil">
          Day {day} of {days}
        </p>
      </header>

      <table className="ledger-table">
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Lot</th>
            <th scope="col" title="Board price, marks">Board</th>
            <th scope="col" title="Sold at, marks">Sold</th>
            <th scope="col" title="Taken from you, marks">Taken</th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {view.history.map((h) => (
              <motion.tr
                key={h.day}
                data-evidence={h.evidence || undefined}
                initial={still ? false : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              >
                <td>
                  {h.evidence ? (
                    <Slam className="ledger-ev" angle={-8} delay={0.2}>
                      <span aria-label={`Day ${h.day}, evidence`}>{h.day}</span>
                    </Slam>
                  ) : (
                    h.day
                  )}
                </td>
                <td className="ledger-species">{h.species}</td>
                <td>{h.fairValue}</td>
                <td>{h.price}</td>
                <td className="ledger-loss">{h.shortfall > 0 ? `−${h.shortfall}` : '0'}</td>
              </motion.tr>
            ))}
          </AnimatePresence>
          {view.history.length === 0 && (
            <tr className="ledger-blank">
              <td colSpan={5}>No sales yet. Today's lot is on the slate.</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="ledger-total">
        <span className="typed">Taken from you, season to date</span>
        <motion.strong
          key={view.shortfallTotal}
          className="sign"
          initial={still ? false : { scale: 1.12 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        >
          {view.shortfallTotal > 0 ? `−${view.shortfallTotal}` : '0'} <small>marks</small>
        </motion.strong>
      </div>

      <div className="ledger-case" data-tour="evidence">
        <span className="label">Evidence on record</span>
        <span className="ledger-boxes" aria-label={`${caseCount} evidence days on record; ${CASE_DAYS} needed to offer leniency`}>
          {Array.from({ length: Math.max(CASE_DAYS, Math.min(days, caseCount)) }, (_, i) => (
            <i key={i} data-on={i < caseCount || undefined} data-need={i < CASE_DAYS || undefined} />
          ))}
        </span>
        <span className="typed ledger-case-note">
          {s
            ? 'Case closed on NEAR.'
            : caseCount >= CASE_DAYS
              ? 'Enough to offer leniency.'
              : `${caseCount} of ${CASE_DAYS} days needed · a ringed day is evidence: four or five sealed bids matched under the board`}
        </span>
      </div>

      {s && (
        <motion.div
          className="ledger-payout"
          initial={still ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 1.2, ease: [0.2, 0.9, 0.25, 1.15] }}
        >
          <span className="typed">Leniency payout · from their bonds</span>
          <strong className="data">+{yoctoToNear(s.payoutYocto, 2)} Ⓝ</strong>
          <a className="typed-link" href={txUrl(s.tx)} target="_blank" rel="noreferrer">
            slash receipt ↗
          </a>
        </motion.div>
      )}
    </aside>
  );
}
