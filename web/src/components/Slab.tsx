import { AnimatePresence, motion } from 'motion/react';
import type { Lot, View } from '../lib/state';
import { txUrl } from '../lib/wallet';

const FISH: Array<[RegExp, string]> = [
  [/cod/i, 'fish_cod'],
  [/halibut/i, 'fish_halibut'],
  [/monk/i, 'fish_monkfish'],
  [/tuna|bluefin/i, 'fish_bluefin'],
  [/bass/i, 'fish_seabass'],
  [/lobster/i, 'fish_lobster'],
];
const fishArt = (species: string) => FISH.find(([re]) => re.test(species))?.[1] ?? 'fish_cod';

export function Slab({
  lot,
  bestBid,
  identical,
  settledPrice,
  token,
  ownerName,
  sea,
}: {
  lot: Lot | null;
  bestBid: number | null;
  identical: boolean;
  settledPrice: number | null;
  token: View['token'];
  ownerName: string | null;
  sea?: View['sea'];
}) {
  const price = settledPrice ?? bestBid;
  const gap = lot && price != null ? lot.fairValue - price : null;
  return (
    <div className="slab-wrap">
      <AnimatePresence mode="wait">
        {lot ? (
          <motion.section
            key={lot.day}
            className="slab"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, transition: { duration: 0.2 } }}
            transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1] }}
            aria-label={`Today's lot: ${lot.weightKg} kilograms of ${lot.species}`}
          >
            <div className="slab-fish">
              <img src={`/art/${fishArt(lot.species)}.webp`} alt="" draggable={false} />
            </div>
            <div className="slab-info">
              <p className="slab-kicker">Lot {lot.day} · on the zinc</p>
              <h2 className="display">
                {lot.weightKg} kg <span>{lot.species}</span>
              </h2>
              <dl className="slab-prices">
                <div>
                  <dt>Board price</dt>
                  <dd className="mono">{lot.fairValue}</dd>
                </div>
                <div data-tone={gap && gap > 0 ? 'bad' : undefined}>
                  <dt>{settledPrice != null ? 'Sold at' : 'Best bid'}</dt>
                  <dd className="mono">{price ?? '··'}</dd>
                </div>
                <div data-tone={gap && gap > 0 ? 'bad' : undefined}>
                  <dt>Taken from you</dt>
                  <dd className="mono">{gap != null ? (gap > 0 ? `−${gap}` : '0') : '··'}</dd>
                </div>
              </dl>
              {(lot.market || sea) && (
                <p className="source-row mono">
                  {lot.market && (
                    <a href={lot.market.url} target="_blank" rel="noreferrer" title="Board price comes from real ex-vessel prices">
                      {lot.market.source} · {lot.market.year} ex-vessel ${lot.market.usdPerLb.toFixed(2)}/lb ↗
                    </a>
                  )}
                  {sea && (
                    <span title={`${sea.source}, ${sea.at}`}>
                      · waves {sea.waveM.toFixed(1)} m off {sea.port.split(',')[0]} (live)
                    </span>
                  )}
                </p>
              )}
              {token && (
                <motion.p
                  className="token-chip mono"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                >
                  <span className="token-dot" aria-hidden />
                  NEP-245 CATCH <strong>{token.id}</strong> · {token.amount} kg ·{' '}
                  {token.transferTx ? (
                    <a href={txUrl(token.transferTx)} target="_blank" rel="noreferrer">
                      now held by {ownerName ?? token.owner} ↗
                    </a>
                  ) : (
                    <a href={txUrl(token.mintTx)} target="_blank" rel="noreferrer">
                      minted, held in escrow ↗
                    </a>
                  )}
                </motion.p>
              )}
              <AnimatePresence>
                {identical && (
                  <motion.p
                    className="slab-alert"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                  >
                    Five buyers. Five sealed bids. The same number.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </motion.section>
        ) : (
          <motion.p key="empty" className="slab-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            The zinc is empty. The boats are coming in.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
