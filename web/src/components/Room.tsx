import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BuyerId } from '../../../shared/api';
import type { SessionMeta } from '../lib/driver';
import { lastLineOf, type View } from '../lib/state';
import { useBlockHeight } from '../lib/useBlockHeight';
import type { Pending } from '../lib/useGame';
import { txUrl, yoctoToNear } from '../lib/wallet';
import { BuyerCard, type BondState, type Outcome } from './BuyerCard';
import { Ledger } from './Ledger';
import { Slab } from './Slab';

interface Props {
  meta: SessionMeta;
  view: View;
  pending: Pending;
  act: (a: 'sell' | 'hold' | 'next_day') => void;
  offerLeniency: () => void;
  openCase: () => void;
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

export function Room({ meta, view, pending, act, offerLeniency, openCase }: Props) {
  const status = view.status;
  const bestBid = view.reveals ? Math.max(...view.reveals.map((r) => r.amount)) : null;
  const bondNear = yoctoToNear(meta.bondYocto, 2);
  const deliberatingSet = useMemo(() => new Set(view.deliberating), [view.deliberating]);
  const height = useBlockHeight(view.leniencyOpen && !view.slashed && !view.holdout && view.deadlineBlock != null);

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

  return (
    <div className="room">
      <div className="room-stage">
        <AnimatePresence>
          {view.leniencyOpen && !view.slashed && !view.holdout && (
            <motion.div
              className="leniency-banner"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            >
              <strong className="display">Leniency is on the table.</strong>
              <span>The first buyer to hand the contract a signed pact walks free. Everyone else loses their bond.</span>
              <span className="leniency-clock">
                {view.deadlineBlock && height
                  ? `On-chain window · ${Math.max(0, view.deadlineBlock - height)} blocks left · closes itself at block ${view.deadlineBlock.toLocaleString()}`
                  : 'On-chain window · the contract closes it by itself after 200 blocks'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="buyers">
          {meta.buyers.map((b, i) => (
            <BuyerCard
              key={b.id}
              index={i}
              id={b.id}
              name={b.name}
              bond={bondOf(view, b.id)}
              bondNear={bondNear}
              bid={
                view.reveals?.find((r) => r.buyer === b.id)?.amount ??
                (view.committed[b.id] ? 'sealed' : 'none')
              }
              identical={view.identical}
              isWinner={view.settled?.winner === b.id}
              line={lastLineOf(view, b.id)}
              deliberating={deliberatingSet.has(b.id)}
              outcome={outcomeOf(view, b.id)}
            />
          ))}
        </div>

        <div style={{ visibility: view.leniencyOpen && !view.slashed && !view.holdout ? 'hidden' : 'visible' }}>
          <Slab
            lot={view.lot}
            bestBid={bestBid}
            identical={view.identical}
            settledPrice={view.settled?.price ?? null}
            token={view.token}
            ownerName={view.token?.ownerBuyer ? meta.buyers.find((b) => b.id === view.token?.ownerBuyer)?.name ?? null : null}
          />
        </div>
      </div>

      <Ledger
        view={view}
        status={status}
        days={meta.days}
        pending={pending}
        holdsLeft={Math.max(0, 2 - holds)}
        onSell={() => act('sell')}
        onHold={hold}
        onNext={() => act('next_day')}
        onLeniency={offerLeniency}
      />

      <AnimatePresence>
        {(view.slashed || view.holdout || view.closed) && (
          <Verdict view={view} meta={meta} onCase={openCase} onContinue={() => act('next_day')} pending={pending} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Verdict({
  view,
  meta,
  onCase,
  onContinue,
  pending,
}: {
  view: View;
  meta: SessionMeta;
  onCase: () => void;
  onContinue: () => void;
  pending: Pending;
}) {
  const [dismissed, setDismissed] = useState(false);
  const s = view.slashed;
  const confessorName = s ? meta.buyers.find((b) => b.id === s.confessor)?.name : null;
  if (view.holdout && !view.closed && dismissed) return null;
  return (
    <motion.div
      className="verdict"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, delay: s ? 4.2 : 0.4 }}
    >
      <motion.div
        className="verdict-card"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: s ? 4.4 : 0.5, ease: [0.23, 1, 0.32, 1] }}
      >
        <div className="verdict-copy">
        {s ? (
          <>
            <p className="verdict-kicker">Somebody talked</p>
            <h2 className="display">{confessorName} handed over the pact.</h2>
            <p className="verdict-sub">
              The contract checked every signature. {s.slashed.length} bonds slashed. A second confession was refused.
            </p>
          </>
        ) : view.closed ? (
          <>
            <p className="verdict-kicker">Season over</p>
            <h2 className="display">They kept their mouths shut.</h2>
            <p className="verdict-sub">You were robbed of {view.shortfallTotal} marks. Every bond went home.</p>
          </>
        ) : (
          <>
            <p className="verdict-kicker">Leniency refused</p>
            <h2 className="display">Nobody talked. Not today.</h2>
            <p className="verdict-sub">The pressure stays on. Their identical bids are still on the record.</p>
          </>
        )}
        <div className="verdict-actions">
          {view.closed ? (
            <button className="btn btn-amber" onClick={onCase}>
              Open the case file
            </button>
          ) : (
            <button className="btn btn-amber" onClick={() => setDismissed(true)} disabled={pending !== null}>
              Back to the table
            </button>
          )}
          {!view.closed && view.settled && (
            <button className="btn btn-ghost" onClick={onContinue} disabled={pending !== null}>
              Next day
            </button>
          )}
        </div>
        </div>
        {s && (
          <div className="payout">
            <span>Paid to you from their bonds</span>
            <strong className="mono">{yoctoToNear(s.payoutYocto, 2)} Ⓝ</strong>
            <a href={txUrl(s.tx)} target="_blank" rel="noreferrer">
              See the slash on NEAR testnet ↗
            </a>
            {view.payoutEvm && (
              <a href={`https://sepolia.etherscan.io/tx/${view.payoutEvm.sepoliaTx}`} target="_blank" rel="noreferrer">
                Paid out on Ethereum Sepolia via NEAR chain signatures ↗
              </a>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
