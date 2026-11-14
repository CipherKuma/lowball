import { AnimatePresence, motion } from 'motion/react';
import type { SessionMeta } from '../lib/driver';
import type { View } from '../lib/state';
import { txUrl, yoctoToNear } from '../lib/wallet';

const ease = [0.23, 1, 0.32, 1] as const;

/** Before dawn: accounts, season, bonds land on-chain while the buyers talk in the back room. */
export function Setup({ meta, view, error }: { meta: SessionMeta | null; view: View; error: string | null }) {
  const rows: Array<{ label: string; tx?: string; done: boolean }> = [
    { label: 'Your fisher account opens on NEAR testnet', tx: view.txs.find((t) => t.label.startsWith('Fisher'))?.tx, done: !!view.playerAccountId },
    { label: view.seasonId != null ? `Season #${view.seasonId} written to the Lowball contract` : 'A new season is written to the Lowball contract', tx: view.txs.find((t) => t.label.startsWith('Season'))?.tx, done: view.seasonId != null },
  ];
  const bonded = Object.keys(view.bonds).length;
  return (
    <main className="setup">
      <motion.div className="setup-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}>
        <p className="slab-kicker">Before dawn</p>
        <h2 className="display">The buyers are arriving.</h2>
        <ul className="setup-rows">
          {rows.map((r) => (
            <li key={r.label} data-done={r.done || undefined}>
              <i aria-hidden />
              <span>{r.label}</span>
              {r.tx && (
                <a href={txUrl(r.tx)} target="_blank" rel="noreferrer" className="mono">
                  tx ↗
                </a>
              )}
            </li>
          ))}
          <li data-done={bonded === 5 || undefined}>
            <i aria-hidden />
            <span>
              Each buyer locks a {meta ? yoctoToNear(meta.bondYocto, 2) : '0.20'} Ⓝ bond in the contract
            </span>
            <span className="bond-count mono">{bonded}/5</span>
          </li>
        </ul>
        <div className="setup-bonds">
          {(meta?.buyers ?? []).map((b, i) => (
            <motion.div
              key={b.id}
              className="setup-buyer"
              data-bonded={!!view.bonds[b.id] || undefined}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease, delay: 0.1 + i * 0.06 }}
            >
              <img src={`/art/${b.id}_calm.webp`} alt="" />
              <span>{b.name.split(' ')[0] === 'The' ? 'Deacon' : b.name.split(' ')[0]}</span>
            </motion.div>
          ))}
        </div>
        <AnimatePresence>
          {view.cartelForming && (
            <motion.div
              className="backroom"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.5, ease }}
            >
              <span className="whisper" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <p>
                Voices behind the warehouse door. The five of them are talking in private, and you are not invited.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        {view.rumours.length > 0 && <p className="setup-rumour">“{view.rumours[view.rumours.length - 1]}”</p>}
        {error && <p className="setup-error" role="alert">{error}</p>}
      </motion.div>
    </main>
  );
}
