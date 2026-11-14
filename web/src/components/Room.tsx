import { AnimatePresence } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BuyerId } from '../../../shared/api';
import type { SessionMeta } from '../lib/driver';
import { lastLineOf, type View } from '../lib/state';
import { useBlockHeight } from '../lib/useBlockHeight';
import type { Pending } from '../lib/useGame';
import { yoctoToNear } from '../lib/wallet';
import { BuyerCard, type BondState, type Outcome } from './BuyerCard';
import { InterrogationRoom } from './Interrogation';
import { Ledger } from './Ledger';
import { Slab } from './Slab';
import { ActionBar } from './table/ActionBar';
import { Dispatch } from './table/Dispatch';
import { Envelopes } from './table/Envelopes';
import { OfferOfLeniency, offerOnDesk, type LeniencyStage } from './table/Leniency';
import { Verdict } from './table/Verdict';

export type { LeniencyStage } from './table/Leniency';

interface Props {
  meta: SessionMeta;
  view: View;
  pending: Pending;
  act: (a: 'sell' | 'hold' | 'next_day') => void;
  offerLeniency: () => void;
  openCase: () => void;
  interro: {
    ask: (buyer: BuyerId, input: { audio?: Blob; text?: string }) => void;
    usedToday: boolean;
    pending: boolean;
    error: string | null;
    clearError: () => void;
  };
  /** where the player's offer of leniency stands, for wallet signing (optional; guests sign in the browser) */
  leniencyStage?: LeniencyStage;
  /** wallet = signed in with a NEAR wallet; guest = dock pass key held in this browser */
  playerKind?: 'guest' | 'wallet';
}

function bondOf(v: View, id: BuyerId): BondState {
  if (v.slashed) {
    if (v.slashed.confessor === id) return 'immune';
    return v.slashed.slashed.some((s) => s.buyer === id) ? 'slashed' : 'kept';
  }
  return v.bonds[id] ? 'posted' : 'pending';
}
function outcomeOf(v: View, id: BuyerId): Outcome {
  const a = [...v.attempts].reverse().find((x) => x.buyer === id);
  if (!a) return null;
  return a.ok ? { kind: 'confessed' } : { kind: 'refused', code: a.errorCode };
}

/** The desk under the lamp: posters on the wall, the slate, the envelopes, dispatch, the ledger and the plaques. */
export function Room({ meta, view, pending, act, offerLeniency, openCase, interro, leniencyStage }: Props) {
  const [cornered, setCornered] = useState<{ buyer: BuyerId; sinceSeq: number } | null>(null);
  const phaseOk = view.status?.phase === 'lot_open' || view.status?.phase === 'settled';
  const canLean = phaseOk && !view.slashed && !view.leniencyOpen && !interro.usedToday && pending === null;
  const exchange = cornered
    ? view.interrogations.find((i) => i.buyer === cornered.buyer && i.seq > cornered.sinceSeq) ?? null
    : null;
  const status = view.status;
  const bestBid = view.reveals ? Math.max(...view.reveals.map((r) => r.amount)) : null;
  const bondNear = yoctoToNear(meta.bondYocto, 2);
  const deliberatingSet = useMemo(() => new Set(view.deliberating), [view.deliberating]);
  const height = useBlockHeight(view.leniencyOpen && !view.slashed && !view.holdout && view.deadlineBlock != null);
  const showOffer = offerOnDesk(view, pending, leniencyStage);
  const wins = useMemo(() => {
    const w: Partial<Record<BuyerId, number>> = {};
    for (const h of view.history) if (h.winner) w[h.winner] = (w[h.winner] ?? 0) + 1;
    return w;
  }, [view.history]);

  // Holds are capped per day by the server; count re-seals of a lot that was already fully sealed.
  const [holds, setHolds] = useState(0);
  const dayRef = useRef<number | null>(null);
  useEffect(() => {
    if (view.lot?.day !== dayRef.current) {
      dayRef.current = view.lot?.day ?? null;
      setHolds(0);
    }
  }, [view.lot?.day]);
  const hold = () => {
    setHolds((h) => h + 1);
    act('hold');
  };

  const closedNote = interro.usedToday && !view.slashed && !view.closed ? 'back room closed till tomorrow' : undefined;
  const leanNote = view.slashed
    ? 'The back room is quiet now.'
    : interro.usedToday
      ? 'You leaned on someone today. The back room opens again tomorrow.'
      : view.leniencyOpen
        ? 'Nobody goes to the back room while the offer is on the table.'
        : canLean
          ? 'Click a poster to lean on that buyer in the back room · once a day.'
          : pending !== null
            ? 'The back room waits while the pier is busy.'
            : 'The back room opens once the lot is on the slate.';

  return (
    <div className="room">
      <section className="wall" data-tour="buyers" aria-label="The buyers">
        <div className="wall-row">
          {meta.buyers.map((b, i) => (
            <BuyerCard
              key={b.id}
              index={i}
              id={b.id}
              name={b.name}
              bond={bondOf(view, b.id)}
              bondNear={bondNear}
              bid={view.reveals?.find((r) => r.buyer === b.id)?.amount ?? (view.committed[b.id] ? 'sealed' : 'none')}
              identical={view.identical}
              isWinner={view.settled?.winner === b.id}
              line={lastLineOf(view, b.id)}
              deliberating={deliberatingSet.has(b.id)}
              outcome={outcomeOf(view, b.id)}
              teeUrl={view.tee[b.id]?.at(-1)?.attestationUrl}
              pressure={view.pressure[b.id]}
              wins={wins[b.id]}
              closedNote={closedNote}
              onLean={canLean ? () => setCornered({ buyer: b.id, sinceSeq: view.lastSeq }) : undefined}
            />
          ))}
        </div>
      </section>

      <section className="desk desk-surface" data-tense={showOffer || undefined}>
        <div className="lamp-pool" aria-hidden />
        <div className="desk-main">
          <div className="desk-lot" data-tour="slate">
            <Slab
              lot={view.lot}
              bestBid={bestBid}
              identical={view.identical}
              settledPrice={view.settled?.price ?? null}
              token={view.token}
              sea={view.sea}
              ownerName={view.token?.ownerBuyer ? meta.buyers.find((b) => b.id === view.token?.ownerBuyer)?.name ?? null : null}
            />
            <AnimatePresence>
              {showOffer && (
                <OfferOfLeniency key="offer" view={view} pending={pending} stage={leniencyStage} height={height} onRetry={offerLeniency} />
              )}
            </AnimatePresence>
          </div>
          <Dispatch view={view} buyers={meta.buyers} />
          <Envelopes buyers={meta.buyers} view={view} pending={pending} />
          <ActionBar
            view={view}
            status={status}
            days={meta.days}
            pending={pending}
            holdsLeft={Math.max(0, 2 - holds)}
            leanNote={leanNote}
            onSell={() => act('sell')}
            onHold={hold}
            onNext={() => act('next_day')}
            onLeniency={offerLeniency}
          />
        </div>
        <Ledger view={view} status={status} days={meta.days} />
      </section>

      <AnimatePresence>
        {cornered && (
          <InterrogationRoom
            buyer={meta.buyers.find((b) => b.id === cornered.buyer)!}
            exchange={exchange}
            pending={interro.pending}
            error={interro.error}
            onAsk={(input) => interro.ask(cornered.buyer, input)}
            onClose={() => {
              setCornered(null);
              interro.clearError();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(view.slashed || view.holdout || view.closed) && (
          <Verdict view={view} meta={meta} onCase={openCase} onContinue={() => act('next_day')} pending={pending} />
        )}
      </AnimatePresence>
    </div>
  );
}
