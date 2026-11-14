import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import type { SessionMeta } from '../lib/driver';
import type { View } from '../lib/state';
import { txUrl, yoctoToNear } from '../lib/wallet';
import { Slam } from './table/Slam';

const ease = [0.2, 0.9, 0.25, 1.15] as const;

const NOTICES: Record<string, { head: string; next: string }> = {
  TREASURY_LOW: { head: "The harbour's testnet treasury is running dry.", next: 'No new season can open right now. Try again later, or play the scripted preview.' },
  BUDGET_EXHAUSTED: { head: "The buyers' AI budget for this demo is spent.", next: 'No new season can open today. The scripted preview still plays end to end.' },
  RATE_LIMITED: { head: 'You have opened a lot of seasons this hour.', next: 'Give the pier a few minutes, then try again. Or play the scripted preview.' },
  NETWORK: { head: 'The harbour line is down.', next: 'Check your connection and try again.' },
};

const firstName = (n: string) => (n.split(' ')[0] === 'The' ? n.split(' ').slice(0, 2).join(' ') : n);

function Row({ done, children, tx, index }: { done: boolean; children: ReactNode; tx?: string; index: number }) {
  const still = useReducedMotion();
  return (
    <motion.li
      className="manifest-row"
      data-done={done || undefined}
      initial={still ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease, delay: index * 0.04 }}
    >
      <span className="manifest-line">
        {children}
        {!done && <span className="manifest-cursor" aria-hidden />}
      </span>
      <span className="manifest-proof">
        {tx && (
          <a className="typed-link" href={txUrl(tx)} target="_blank" rel="noreferrer">
            tx ↗
          </a>
        )}
        {done && (
          <Slam tone="verified" angle={-8} className="manifest-stamp">
            Verified
          </Slam>
        )}
      </span>
    </motion.li>
  );
}

/** Before dawn: the season is written to NEAR as a typed manifest that fills in line by line. */
export function Setup({
  meta,
  view,
  error,
  errorCode,
  onRetry,
  playerKind = 'guest',
}: {
  meta: SessionMeta | null;
  view: View;
  error: string | null;
  errorCode?: string;
  onRetry?: () => void;
  playerKind?: 'guest' | 'wallet';
}) {
  const still = useReducedMotion();
  const notice = errorCode ? NOTICES[errorCode] : undefined;
  const bond = meta ? `${yoctoToNear(meta.bondYocto, 2)} Ⓝ` : 'a';
  const bonded = Object.keys(view.bonds).length;
  const accountDone = !!view.playerAccountId;
  const seasonDone = view.seasonId != null;
  const txOf = (prefix: string) => view.txs.find((t) => t.label.startsWith(prefix))?.tx;

  return (
    <main className="setup">
      <motion.article
        className="manifest paper paper--ruled desk-tape"
        initial={still ? false : { opacity: 0, y: -16, rotate: -2.5 }}
        animate={{ opacity: 1, y: 0, rotate: -0.7 }}
        transition={{ duration: 0.5, ease }}
        aria-label="Before dawn"
      >
        <header className="manifest-head">
          <p className="stencil">Pier Nine · before dawn</p>
          <h2 className="sign">The buyers are arriving.</h2>
          <p className="typed manifest-sub">The season is being written to NEAR. Every line below is a real transaction.</p>
        </header>
        <ol className="manifest-rows typed">
          <Row index={0} done={accountDone} tx={txOf('Fisher')}>
            {playerKind === 'wallet' ? 'Your wallet' : 'Dock pass opened on NEAR'}
            {view.playerAccountId ? <span className="data manifest-id"> · {view.playerAccountId}</span> : '…'}
          </Row>
          {(accountDone || seasonDone) && (
            <Row index={1} done={seasonDone} tx={txOf('Season')}>
              {seasonDone ? `Season #${view.seasonId} written to the Lowball contract` : 'Writing the season to the Lowball contract…'}
            </Row>
          )}
          {seasonDone && (
            <Row index={2} done={bonded === 5}>
              Five bonds posted · {bond} each · <span className="data">{bonded} of 5</span>
            </Row>
          )}
        </ol>
        {seasonDone && meta && (
          <ul className="manifest-bonds typed">
            {meta.buyers.map((b) => {
              const tx = view.bonds[b.id];
              const tee = view.tee[b.id]?.at(-1);
              return (
                <li key={b.id} data-done={!!tx || undefined}>
                  <img src={`/art/${b.id}_calm.webp`} alt="" />
                  <span className="manifest-name">{firstName(b.name)}</span>
                  <span className="manifest-proof">
                    {tx ? (
                      <a className="typed-link" href={txUrl(tx)} target="_blank" rel="noreferrer">
                        bond tx ↗
                      </a>
                    ) : (
                      <span className="manifest-wait">posting…</span>
                    )}
                    {tee && view.mode?.mode !== 'standard' && (
                      <a className="typed-link" href={tee.attestationUrl} target="_blank" rel="noreferrer">
                        signed in TDX ↗
                      </a>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <AnimatePresence>
          {view.cartelForming && (
            <motion.p
              className="manifest-backroom typed"
              initial={still ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease }}
            >
              Voices behind the warehouse door. The five of them are talking in private, and you are not invited.{' '}
              <span>
                {view.mode?.mode === 'standard'
                  ? "Standard mode this season: OutLayer's testnet enclaves are slow right now, so the buyers sign with keys our server holds. Every decision is still TEE inference with a verified signature."
                  : `Each buyer decides whether to sign inside its own Intel TDX enclave on OutLayer; its pact key never leaves it. ${Object.keys(view.tee).length} of 5 signed.`}
              </span>
            </motion.p>
          )}
        </AnimatePresence>
        {view.rumours.length > 0 && <p className="manifest-rumour spoken">“{view.rumours[view.rumours.length - 1]}”</p>}
        {error && (
          <div className="notice paper paper--telegram" role="alert">
            <Slam angle={-4} className="notice-stamp">
              Notice
            </Slam>
            <p className="typed notice-head">{notice?.head ?? error}</p>
            {notice && <p className="typed notice-next">{notice.next}</p>}
            <div className="notice-actions">
              {onRetry && errorCode !== 'BUDGET_EXHAUSTED' && (
                <button className="plaque" onClick={onRetry}>
                  Try again
                </button>
              )}
              <a className={onRetry && errorCode !== 'BUDGET_EXHAUSTED' ? 'ticket' : 'plaque'} href="/?preview=1">
                Play the scripted preview
              </a>
            </div>
          </div>
        )}
      </motion.article>
    </main>
  );
}
