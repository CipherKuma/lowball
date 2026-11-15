import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { CasefileResponse, ForgeResponse } from '../../../shared/api';
import { BUYER_NAMES } from '../../../shared/api';
import { audio } from '../lib/audio';
import type { View } from '../lib/state';
import { yoctoToNear } from '../lib/wallet';
import { Chain } from './casefile/Chain';
import { Pact } from './casefile/Pact';
import { Transcripts } from './casefile/Transcripts';
import { ForgeryDrill } from './ForgeryDrill';
import { Stamp } from './ui/Stamp';
import { Wiretap } from './Wiretap';
import '../styles/casefile-docs.css';

type Tab = 'pact' | 'chain' | 'room' | 'cheat';
const TABS: ReadonlyArray<readonly [Tab, string]> = [
  ['pact', 'The pact'],
  ['chain', 'On-chain record'],
  ['room', 'The back room'],
  ['cheat', 'Try to cheat'],
];
const drop = [0.2, 0.9, 0.25, 1.15] as const;

export function CaseFile({
  load,
  view,
  wiretapUrl,
  forge,
  onReplay,
  onSeasons,
}: {
  load: () => Promise<CasefileResponse>;
  view: View;
  wiretapUrl: string | null;
  forge: () => Promise<ForgeResponse>;
  onReplay: () => void;
  /** back to the docket of this player's seasons */
  onSeasons?: () => void;
}) {
  const still = useReducedMotion();
  const [data, setData] = useState<CasefileResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('pact');
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    audio.sfx('folder_open', 0.7);
    load().then(setData, (e: Error) => setErr(e.message));
  }, [load]);

  const pick = (t: Tab) => {
    if (t === tab) return;
    audio.sfx('paper_slide', 0.4);
    setTab(t);
    tabRefs.current[t]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex(([k]) => k === tab);
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const k = TABS[(next + TABS.length) % TABS.length][0];
    pick(k);
    tabRefs.current[k]?.focus();
  };

  const verified = data?.receipts.filter((r) => r.verification.verified).length ?? 0;
  const confessor = view.slashed?.confessor;
  const slashedCount = view.slashed?.slashed.length ?? 0;

  return (
    <main className="cf">
      <div className="lamp-pool" style={{ ['--ly' as string]: '12%' }} aria-hidden />
      <motion.div
        className="cf-folder"
        data-tour="casefile"
        initial={still ? false : { y: 36, opacity: 0, rotate: -1.6 }}
        animate={{ y: 0, opacity: 1, rotate: -0.3 }}
        transition={{ duration: 0.6, ease: drop }}
      >
        <p className="cf-tab stencil">Case file · Season #{data?.seasonId ?? view.seasonId ?? '—'}</p>
        <div className="cf-cover paper paper--manila">
          <header className="cf-head">
            <div className="cf-verdict">
              <p className="cf-kicker typed">The harbour vs. the Pier Nine ring</p>
              <h2 className="cf-title sign">{confessor ? `${BUYER_NAMES[confessor]} talked.` : 'Nobody talked.'}</h2>
              <span className="cf-verdict-stamp">
                {confessor ? (
                  <Stamp angle={-8} delay={0.5} className="stamp-rot">Confessed</Stamp>
                ) : (
                  <Stamp angle={-8} delay={0.5} tone="carbon" className="stamp-rot">Case closed</Stamp>
                )}
              </span>
            </div>
            <dl className="cf-facts">
              <div>
                <dt className="label">Taken from you</dt>
                <dd><span className="sign">{view.shortfallTotal}</span> <span className="typed">marks</span></dd>
              </div>
              <div>
                <dt className="label">Paid to you</dt>
                <dd>
                  <span className="sign">{view.slashed ? yoctoToNear(view.slashed.payoutYocto, 2) : '0'}</span> <span className="typed">Ⓝ</span>
                </dd>
                <dd className="cf-fact-note typed">
                  {view.slashed ? `from ${slashedCount} slashed bond${slashedCount === 1 ? '' : 's'}` : 'no bonds were slashed'}
                </dd>
              </div>
              <div>
                <dt className="label">AI receipts verified</dt>
                <dd><span className="sign">{data ? `${verified}/${data.receipts.length}` : '…'}</span></dd>
                <dd className="cf-fact-note data">{data?.model ?? ''}</dd>
              </div>
            </dl>
          </header>

          <div className="cf-tabs" role="tablist" aria-label="Case file sections" onKeyDown={onTabKey}>
            {TABS.map(([k, label]) => (
              <button
                key={k}
                ref={(n) => {
                  tabRefs.current[k] = n;
                }}
                id={`cf-tab-${k}`}
                role="tab"
                className="cf-tabbtn"
                aria-selected={tab === k}
                aria-controls={`cf-panel-${k}`}
                tabIndex={tab === k ? 0 : -1}
                onClick={() => pick(k)}
              >
                {label}
              </button>
            ))}
          </div>

          <section className="cf-body" role="tabpanel" id={`cf-panel-${tab}`} aria-labelledby={`cf-tab-${tab}`}>
            {err && <p className="cf-error typed" role="alert">The case file would not open: {err}</p>}
            {!data && !err && tab !== 'cheat' && <p className="cf-loading typed">Pulling the file…</p>}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab + (data ? '1' : '0')}
                initial={still ? false : { opacity: 0, y: -10, rotate: -0.6 }}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                exit={still ? undefined : { opacity: 0, y: 6, transition: { duration: 0.12 } }}
                transition={{ duration: 0.36, ease: drop }}
              >
                {data && tab === 'pact' && <Pact data={data} confessor={confessor} />}
                {data && tab === 'chain' && <Chain data={data} view={view} />}
                {data && tab === 'room' && (
                  <div className="cf-room">
                    <Wiretap url={wiretapUrl} />
                    <Transcripts data={data} view={view} />
                  </div>
                )}
                {tab === 'cheat' && <ForgeryDrill run={forge} />}
              </motion.div>
            </AnimatePresence>
          </section>
        </div>

        <footer className="cf-foot">
          <button className="plaque" onClick={onReplay}>
            Play another season
          </button>
          <span className="plaque-note">A fresh pact, the same five buyers, new money on the line.</span>
          {onSeasons && (
            <button className="typed-link cf-seasons" onClick={onSeasons}>
              All your seasons →
            </button>
          )}
        </footer>
      </motion.div>
    </main>
  );
}
