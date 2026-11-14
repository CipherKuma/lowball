import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { audio } from '../lib/audio';
import type { TxItem } from '../lib/state';
import { accountUrl, txUrl } from '../lib/wallet';

export function TopBar({
  txs,
  player,
  seasonId,
  mode,
}: {
  txs: TxItem[];
  player: string | null;
  seasonId: number | null;
  mode?: { mode: 'enclave' | 'standard'; reason: string } | null;
}) {
  const [muted, setMuted] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <header className="topbar">
      <span className="brand">Lowball</span>
      <div className="topbar-right">
        {seasonId != null && <span className="chip mono">Season #{seasonId}</span>}
        {mode && (
          <span
            className="chip mode-chip"
            data-mode={mode.mode}
            title={
              mode.mode === 'enclave'
                ? "Each buyer's pact key lives in its own Intel TDX enclave on OutLayer"
                : `Standard mode: buyers sign with server-held keys this season. ${mode.reason}`
            }
          >
            <span className="dot" /> {mode.mode === 'enclave' ? 'Enclave mode' : 'Standard mode'}
          </span>
        )}
        <span className="chip">
          <span className="dot" /> NEAR testnet
        </span>
        {txs.length > 0 && (
          <button className="chip chip-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {txs.length} on-chain receipts
          </button>
        )}
        <button
          className="icon-btn"
          aria-label={muted ? 'Unmute' : 'Mute'}
          onClick={() => {
            audio.setMuted(!muted);
            setMuted(!muted);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M4 9h4l5-4v14l-5-4H4z" strokeLinejoin="round" />
            {muted ? <path d="M17 9l5 6M22 9l-5 6" strokeLinecap="round" /> : <path d="M17 8.5a5 5 0 010 7M19.5 6a8.5 8.5 0 010 12" strokeLinecap="round" />}
          </svg>
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            className="tx-drawer"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            <p className="slab-kicker">Every move is a transaction</p>
            {player && (
              <a className="tx-player mono" href={accountUrl(player)} target="_blank" rel="noreferrer">
                {player} ↗
              </a>
            )}
            <ol>
              {[...txs].reverse().map((t) => (
                <li key={t.seq}>
                  <span>{t.label}</span>
                  <a className="mono" href={txUrl(t.tx)} target="_blank" rel="noreferrer">
                    {t.tx.slice(0, 6)}…{t.tx.slice(-4)} ↗
                  </a>
                </li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
