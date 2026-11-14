import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { audio } from '../lib/audio';
import type { TxItem } from '../lib/state';
import { accountUrl, txUrl } from '../lib/wallet';

type Mode = { mode: 'enclave' | 'standard'; reason: string };

const modeText = (m: Mode) =>
  m.mode === 'enclave'
    ? "Enclave mode: each buyer's pact key lives in its own Intel TDX enclave on OutLayer and never leaves it."
    : `Standard mode: the buyers sign with keys our server holds this season. ${m.reason}`;

/** The brass-and-wood rail over the desk: who you are, which season, every receipt, sound. */
export function TopBar({
  txs,
  player,
  seasonId,
  mode,
  playerKind = 'guest',
}: {
  txs: TxItem[];
  player: string | null;
  seasonId: number | null;
  mode?: Mode | null;
  /** wallet = a NEAR wallet the player signed in with; guest = a dock pass key held in this browser */
  playerKind?: 'guest' | 'wallet';
}) {
  const [muted, setMuted] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    addEventListener('keydown', onKey);
    addEventListener('pointerdown', onDown);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <header className="rail" ref={ref}>
      <span className="rail-mark sign">Lowball</span>
      <span className="rail-sep" aria-hidden />
      {seasonId != null && <span className="rail-season stencil">Season #{seasonId}</span>}
      <span className="rail-who typed" title={player ?? undefined}>
        {playerKind === 'wallet' ? (
          <>
            <b className="data">{player ?? 'connecting…'}</b> <span>· your wallet</span>
          </>
        ) : (
          <>
            dock pass <span>· no wallet</span>
          </>
        )}
      </span>
      <span className="rail-fill" />
      {mode && (
        <button className="rail-mode typed" data-mode={mode.mode} title={modeText(mode)} onClick={() => setOpen((o) => !o)}>
          <i aria-hidden /> {mode.mode === 'enclave' ? 'Enclave' : 'Standard'}
          <span className="rail-wide"> mode</span>
        </button>
      )}
      <span className="rail-net typed rail-wide">NEAR testnet</span>
      <button className="rail-receipts" onClick={() => setOpen((o) => !o)} aria-expanded={open} disabled={txs.length === 0 && !mode}>
        <b className="data">{txs.length}</b> <span className="typed">on-chain receipts</span>
      </button>
      <button
        className="rail-mute"
        aria-label={muted ? 'Unmute' : 'Mute'}
        onClick={() => {
          audio.setMuted(!muted);
          setMuted(!muted);
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M4 9h4l5-4v14l-5-4H4z" strokeLinejoin="round" />
          {muted ? <path d="M17 9l5 6M22 9l-5 6" strokeLinecap="round" /> : <path d="M17 8.5a5 5 0 010 7M19.5 6a8.5 8.5 0 010 12" strokeLinecap="round" />}
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="receipts paper"
            initial={{ opacity: 0, y: -8, rotate: -1 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.14 } }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          >
            <p className="label">Every move is a transaction</p>
            <p className="receipts-who typed">
              {playerKind === 'wallet' ? 'Your wallet' : 'Your dock pass'} ·{' '}
              {player ? (
                <a className="data" href={accountUrl(player)} target="_blank" rel="noreferrer">
                  {player} ↗
                </a>
              ) : (
                'opening…'
              )}
              {seasonId != null && <> · Season #{seasonId}</>}
            </p>
            {mode && <p className="receipts-mode typed">{modeText(mode)}</p>}
            <ol>
              {[...txs].reverse().map((t) => (
                <li key={t.seq}>
                  <span className="typed">{t.label}</span>
                  <a className="data" href={txUrl(t.tx)} target="_blank" rel="noreferrer">
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
