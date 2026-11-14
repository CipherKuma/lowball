import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import type { SessionMeta } from '../../lib/driver';
import type { View } from '../../lib/state';
import type { Pending } from '../../lib/useGame';
import { txUrl, yoctoToNear } from '../../lib/wallet';
import { Slam } from './Slam';

interface Props {
  view: View;
  meta: SessionMeta;
  onCase: () => void;
  onContinue: () => void;
  pending: Pending;
}

/** The typed verdict paper that lands on the desk once the leniency window resolves or the season closes. */
export function Verdict({ view, meta, onCase, onContinue, pending }: Props) {
  const still = useReducedMotion();
  const [dismissed, setDismissed] = useState(false);
  const s = view.slashed;
  const nameOf = (id: string) => meta.buyers.find((b) => b.id === id)?.name ?? id;
  // Only what the contract actually refused: later confessions in this window.
  const refused = view.attempts.filter((a) => !a.ok && a.errorCode === 'E_ALREADY_CONFESSED').length;
  if (!view.closed && dismissed) return null;
  // Slashed: give the poster stamps time to land before the paper covers the desk.
  const delay = still ? 0 : s ? 4.2 : 0.4;

  let kicker: string;
  let head: string;
  let body: string;
  if (s) {
    kicker = 'Somebody talked';
    head = `${nameOf(s.confessor)} handed over the pact.`;
    body =
      `The contract checked every signature. ${s.slashed.length} ${s.slashed.length === 1 ? 'bond' : 'bonds'} slashed.` +
      (refused === 1 ? ' One later confession was refused: the window takes the first only.' : refused > 1 ? ` ${refused} later confessions were refused: the window takes the first only.` : '');
  } else if (view.closed) {
    kicker = 'Season over';
    head = 'They kept their mouths shut.';
    body = `You were robbed of ${view.shortfallTotal} marks. Every bond went home.`;
  } else {
    kicker = 'Leniency refused';
    head = 'Nobody talked. Not today.';
    body =
      (view.holdoutReason === 'timeout'
        ? 'The window closed by itself with no pact signed. '
        : 'Not one of them would put a name to the pact. ') +
      'Every bond stays posted and their identical bids stay on the record. Keep selling and keep leaning; you can offer leniency again while the case holds.';
  }

  return (
    <motion.div
      className="verdict"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      <motion.article
        className="verdict-paper paper"
        data-tour="verdict"
        data-kind={s ? 'slashed' : view.closed ? 'closed' : 'holdout'}
        initial={still ? false : { y: -24, rotate: -3, opacity: 0 }}
        animate={{ y: 0, rotate: -0.8, opacity: 1 }}
        transition={{ duration: 0.5, delay: delay + 0.1, ease: [0.2, 0.9, 0.25, 1.15] }}
        aria-label="Verdict"
      >
        <header className="verdict-head">
          <p className="stencil">Verdict · Season #{view.seasonId ?? '—'}</p>
          <p className="typed verdict-kicker">{kicker}</p>
        </header>
        <h2 className="verdict-title sign">{head}</h2>
        <p className="verdict-body typed">{body}</p>
        {s && (
          <div className="verdict-grid">
            <ul className="verdict-names">
              <li>
                <span className="spoken">{nameOf(s.confessor)}</span>
                <Slam tone="verified" angle={-6} delay={delay + 0.5}>
                  Confessed
                </Slam>
              </li>
              {s.slashed.map((x, i) => (
                <li key={x.buyer}>
                  <span className="spoken">{nameOf(x.buyer)}</span>
                  <Slam angle={i % 2 ? 5 : -4} delay={delay + 0.65 + i * 0.08}>
                    Slashed
                  </Slam>
                </li>
              ))}
            </ul>
            <div className="verdict-payout">
              <span className="label">Paid to you from their bonds</span>
              <strong className="sign">{yoctoToNear(s.payoutYocto, 2)} Ⓝ</strong>
              <a className="typed-link" href={txUrl(s.tx)} target="_blank" rel="noreferrer">
                See the slash on NEAR testnet ↗
              </a>
              {view.payoutEvm && (
                <a className="typed-link" href={`https://sepolia.etherscan.io/tx/${view.payoutEvm.sepoliaTx}`} target="_blank" rel="noreferrer">
                  Paid out on Ethereum Sepolia via NEAR chain signatures ↗
                </a>
              )}
            </div>
          </div>
        )}
        <div className="verdict-actions">
          {view.closed ? (
            <button className="plaque" data-tour="casefile" onClick={onCase}>
              Open the case file
            </button>
          ) : (
            <button className="plaque" onClick={() => setDismissed(true)} disabled={pending !== null}>
              Back to the table
            </button>
          )}
          {!view.closed && view.settled && (
            <button className="ticket" onClick={onContinue} disabled={pending !== null}>
              Next day
            </button>
          )}
        </div>
      </motion.article>
    </motion.div>
  );
}
