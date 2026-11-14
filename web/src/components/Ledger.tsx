import { motion } from 'motion/react';
import type { SessionStatus } from '../../../shared/api';
import type { Pending } from '../lib/useGame';
import type { View } from '../lib/state';

interface Props {
  view: View;
  status: SessionStatus | null;
  days: number;
  pending: Pending;
  holdsLeft: number;
  onSell: () => void;
  onHold: () => void;
  onNext: () => void;
  onLeniency: () => void;
}

const MAX_HOLDS = 2;

export function Ledger({ view, status, days, pending, holdsLeft, onSell, onHold, onNext, onLeniency }: Props) {
  const phase = status?.phase;
  const busy = pending !== null || !!status?.busy;
  const allSealed = Object.keys(view.committed).length >= 5;
  const canSell = phase === 'lot_open' && allSealed && !view.settled;
  const canLeniency = !!status?.leniencyAvailable && !view.leniencyOpen && !view.slashed;
  const lastDay = (status?.day ?? 0) >= days;
  const streak = view.identicalStreak;

  return (
    <aside className="ledger" aria-label="Your ledger">
      <header>
        <p className="ledger-kicker">Day {status?.day || view.lot?.day || 0} of {days}</p>
        <h2 className="display">Your ledger</h2>
      </header>
      <div className="ledger-stat">
        <span>Taken from you</span>
        <motion.strong
          key={view.shortfallTotal}
          className="mono"
          initial={{ scale: 1.15, color: '#ff8a7a' }}
          animate={{ scale: 1, color: '#e0574a' }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        >
          {view.shortfallTotal}
          <small> marks</small>
        </motion.strong>
      </div>
      <div className="ledger-evidence" aria-label={`${streak} identical-bid days in a row`}>
        <span>Identical bids</span>
        <div className="evidence-dots">
          {Array.from({ length: days }, (_, i) => (
            <i key={i} data-on={i < view.history.filter((h) => h.identical).length || undefined} />
          ))}
        </div>
      </div>

      <div className="ledger-actions">
        {!view.settled && phase !== 'closed' && (
          <>
            <button className="btn btn-amber" disabled={!canSell || busy} onClick={onSell}>
              {pending === 'sell' ? 'Opening the envelopes…' : 'Open the bids & sell'}
            </button>
            <button className="btn btn-ghost" disabled={!canSell || busy || holdsLeft <= 0} onClick={onHold}>
              {pending === 'hold' ? 'Holding…' : 'Hold the catch'}
              <span className="kbd">{holdsLeft} of {MAX_HOLDS} left today</span>
            </button>
          </>
        )}
        {view.settled && phase !== 'closed' && (
          <button className="btn btn-amber" disabled={busy} onClick={onNext}>
            {pending === 'next_day' ? (lastDay ? 'Closing the season…' : 'Next boat in…') : lastDay ? 'Close the season' : 'Next day'}
          </button>
        )}
        <button className="btn btn-primary leniency-btn" disabled={!canLeniency || busy} onClick={onLeniency}>
          {pending === 'leniency' ? 'Signing on NEAR…' : 'Offer leniency'}
          <span className="kbd">first to confess walks free</span>
        </button>
      </div>

      {view.rumours.length > 0 && (
        <div className="rumours">
          <span>On the pier</span>
          <motion.p key={view.rumours.length} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
            “{view.rumours[view.rumours.length - 1]}”
          </motion.p>
        </div>
      )}

      {view.history.length > 0 && (
        <table className="history mono">
          <thead>
            <tr>
              <th>Day</th>
              <th>Board</th>
              <th>Sold</th>
              <th>Lost</th>
            </tr>
          </thead>
          <tbody>
            {view.history.map((h) => (
              <tr key={h.day} data-identical={h.identical || undefined}>
                <td>{h.day}</td>
                <td>{h.fairValue}</td>
                <td>{h.price}</td>
                <td>−{h.shortfall}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </aside>
  );
}
