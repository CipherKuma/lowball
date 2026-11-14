import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import type { View } from '../../lib/state';
import type { Pending } from '../../lib/useGame';

export type LeniencyStage = 'awaiting-wallet' | 'submitted' | 'open' | 'rejected' | 'failed';
/** The contract's leniency window, in blocks (server and contract constant). */
const WINDOW_BLOCKS = 200;

/** Whether the offer document belongs on the desk right now. */
export function offerOnDesk(view: View, pending: Pending, stage?: LeniencyStage) {
  if (view.slashed || view.holdout) return false;
  return view.leniencyOpen || pending === 'leniency' || (!!stage && stage !== 'open');
}

interface Props {
  view: View;
  pending: Pending;
  stage?: LeniencyStage;
  height: number | null;
  onRetry: () => void;
}

/** The OFFER OF LENIENCY lands on the slate; while the window is open a typed fuse burns down in blocks. */
export function OfferOfLeniency({ view, pending, stage, height, onRetry }: Props) {
  const still = useReducedMotion();
  const open = view.leniencyOpen;
  const left = open && view.deadlineBlock && height ? Math.max(0, view.deadlineBlock - height) : null;
  const deciding = view.deliberating.length;

  let status: ReactNode;
  if (stage === 'rejected') status = <p className="offer-status typed" data-tone="warn">You didn't sign. The offer is still in your hand.</p>;
  else if (stage === 'failed') status = <p className="offer-status typed" data-tone="warn">The offer did not reach NEAR. Nothing was signed on the chain.</p>;
  else if (stage === 'awaiting-wallet') status = <p className="offer-status typed">Sign the offer in your wallet<Dots /></p>;
  else if (!open && stage === 'submitted') status = <p className="offer-status typed">Signed. Waiting for NEAR to open the window<Dots /></p>;
  else if (!open) status = <p className="offer-status typed">{pending === 'leniency' ? 'Signing the offer on NEAR' : 'Getting the offer ready'}<Dots /></p>;
  else
    status = (
      <div className="offer-fuse" role="timer" aria-live="off">
        <p className="typed">
          {left != null ? (
            <>
              The window closes in <b className="data">{left.toLocaleString()}</b> blocks
            </>
          ) : (
            <>The window is open. The contract shuts it by itself after {WINDOW_BLOCKS} blocks</>
          )}
        </p>
        <span className="fuse" aria-hidden>
          <motion.i
            initial={false}
            animate={{ scaleX: left != null ? Math.min(1, left / WINDOW_BLOCKS) : 1 }}
            transition={{ duration: 1.2, ease: 'linear' }}
          />
        </span>
        <p className="typed offer-small">
          {view.deadlineBlock ? `closes itself at block ${view.deadlineBlock.toLocaleString()} · ` : ''}
          {deciding > 0 ? `${deciding} of 5 buyers are deciding` : 'the buyers are reading it'}
        </p>
      </div>
    );

  return (
    <motion.article
      className="offer paper paper--aged desk-tape"
      initial={still ? false : { opacity: 0, y: -18, rotate: -4 }}
      animate={{ opacity: 1, y: 0, rotate: -1.2 }}
      exit={{ opacity: 0, y: 10, transition: { duration: 0.2 } }}
      transition={{ duration: 0.45, ease: [0.2, 0.9, 0.25, 1.15] }}
      aria-label="Offer of leniency"
    >
      <p className="offer-kicker stencil">Season #{view.seasonId ?? '—'} · Lowball contract · NEAR</p>
      <h2 className="offer-title sign">Offer of leniency</h2>
      <p className="offer-terms typed">
        The first buyer to hand the contract a signed pact walks free with their bond. Every other bond is slashed and paid to you.
      </p>
      {status}
      {(stage === 'rejected' || stage === 'failed') && (
        <button className="ticket offer-retry" onClick={onRetry}>
          Try again
        </button>
      )}
      <a className="typed-link offer-source" href="https://www.justice.gov/atr/leniency-policy" target="_blank" rel="noreferrer">
        Modelled on the US DOJ Antitrust Division Leniency Policy, Justice Manual 7-3.300 ↗
      </a>
    </motion.article>
  );
}

function Dots() {
  return (
    <span className="typing-dots" aria-hidden>
      <i>.</i>
      <i>.</i>
      <i>.</i>
    </span>
  );
}
