import type { SessionStatus } from '../../../../shared/api';
import type { View } from '../../lib/state';
import type { Pending } from '../../lib/useGame';
import { CASE_DAYS } from '../Ledger';

const MAX_HOLDS = 2;

interface Props {
  view: View;
  status: SessionStatus | null;
  days: number;
  pending: Pending;
  holdsLeft: number;
  leanNote: string;
  onSell: () => void;
  onHold: () => void;
  onNext: () => void;
  onLeniency: () => void;
}

/** Brass plaques along the desk's front edge. Exactly one lit primary per state; every locked control says why. */
export function ActionBar({ view, status, days, pending, holdsLeft, leanNote, onSell, onHold, onNext, onLeniency }: Props) {
  const phase = status?.phase;
  const busy = pending !== null || !!status?.busy;
  const canSell = phase === 'lot_open' && !view.settled;
  const canLeniency = !!status?.leniencyAvailable && !view.leniencyOpen && !view.slashed;
  const lastDay = (status?.day ?? 0) >= days;
  const caseCount = view.history.filter((h) => h.evidence).length;
  // When the case is ready, the red stamp is the lit control and the day's routine steps back to paper.
  const leniencyLeads = canLeniency && !busy;
  const lead = leniencyLeads ? 'ticket' : 'plaque';
  const closed = phase === 'closed' || view.closed;

  const sellNote =
    pending === 'sell'
      ? 'the five envelopes are being opened on NEAR'
      : !canSell
        ? view.leniencyOpen
          ? 'sales wait while the offer is on the table'
          : 'the lot is not open yet'
        : busy
          ? 'one moment · the pier is busy'
          : 'sells to the best sealed bid';
  const holdNote = holdsLeft <= 0 ? `no holds left today · 0 of ${MAX_HOLDS}` : `${holdsLeft} of ${MAX_HOLDS} left today`;
  const lenNote = view.slashed
    ? 'the case is closed'
    : view.leniencyOpen
      ? 'offer made · the window is open'
      : pending === 'leniency'
        ? 'signing the offer on NEAR'
        : caseCount < CASE_DAYS
          ? `build your case first · ${caseCount} of ${CASE_DAYS} evidence days on record`
          : canLeniency
            ? 'first to confess walks free'
            : 'not open right now · try after the next lot opens';

  return (
    <div className="actions" role="group" aria-label="Your moves">
      {!closed && !view.settled && (
        <>
          <div className="action">
            <button className={lead} data-tour="sell" disabled={!canSell || busy} onClick={onSell}>
              {pending === 'sell' ? 'Opening the envelopes…' : 'Open the bids & sell'}
            </button>
            <span className="plaque-note">{sellNote}</span>
          </div>
          <div className="action">
            <button className="ticket" data-tour="hold" disabled={!canSell || busy || holdsLeft <= 0} onClick={onHold}>
              {pending === 'hold' ? 'Holding…' : 'Hold the catch'}
            </button>
            <span className="plaque-note">{holdNote}</span>
          </div>
        </>
      )}
      {!closed && view.settled && (
        <div className="action">
          <button className={lead} data-tour="next-day" disabled={busy} onClick={onNext}>
            {pending === 'next_day' ? (lastDay ? 'Closing the season…' : 'Next boat in…') : lastDay ? 'Close the season' : 'Next day'}
          </button>
          <span className="plaque-note">
            {lastDay ? `day ${days} of ${days} · settles the season on NEAR` : `day ${(status?.day ?? 0) + 1} of ${days} comes in`}
          </span>
        </div>
      )}
      {!closed && (
        <div className="action action--leniency">
          <button className="plaque plaque--stamp" data-tour="leniency" disabled={!canLeniency || busy} onClick={onLeniency}>
            {pending === 'leniency' ? (view.leniencyOpen ? 'The buyers are deciding…' : 'Signing on NEAR…') : 'Offer leniency'}
          </button>
          <span className="plaque-note">{lenNote}</span>
        </div>
      )}
      {closed && <p className="actions-closed typed">The season is closed. The verdict is on the desk.</p>}
      {!closed && <p className="actions-hint typed">{leanNote}</p>}
    </div>
  );
}
