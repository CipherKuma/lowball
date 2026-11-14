import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
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

/** "04:12 IST" in the viewer's own zone; falls back to the raw stamp. */
function clock(at: string) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

/** The chalk slate: today's lot, its board price, the sea, and the best bid once the envelopes are open. */
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
  const still = useReducedMotion();
  const price = settledPrice ?? bestBid;
  const under = lot && price != null && price < lot.fairValue;
  return (
    <section className="slate slate-lot" aria-label={lot ? `Today's lot: ${lot.weightKg} kilograms of ${lot.species}` : 'The lot board'}>
      <AnimatePresence mode="wait" initial={false}>
        {lot ? (
          <motion.div
            key={lot.day}
            className="lot"
            initial={still ? false : { opacity: 0, filter: 'blur(3px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, transition: { duration: 0.18 } }}
            transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="lot-head">
              <p className="lot-kicker stencil chalk-dim">Lot {lot.day} · on the zinc</p>
              <h2
                className="lot-species sign chalk"
                data-long={Math.max(...lot.species.split(' ').map((w) => w.length)) > 7 || undefined}
              >
                {lot.species}
              </h2>
              <p className="lot-weight data">
                {lot.weightKg} <span>kg</span>
              </p>
            </div>
            <div className="lot-ice">
              <img src={`/art/${fishArt(lot.species)}.webp`} alt="" draggable={false} />
            </div>
            <dl className="lot-figures">
              <div>
                <dt className="label">Board price</dt>
                <dd className="sign chalk">
                  {lot.fairValue} <small>marks</small>
                </dd>
                {lot.market && (
                  <a
                    className="lot-source typed"
                    href={lot.market.url}
                    target="_blank"
                    rel="noreferrer"
                    title="The board price follows real ex-vessel landings prices"
                  >
                    {lot.market.source} {lot.market.year} · ${lot.market.usdPerLb.toFixed(2)}/lb ex-vessel ↗
                  </a>
                )}
              </div>
              <div data-under={under || undefined}>
                <dt className="label">{settledPrice != null ? 'Sold at' : 'Best bid'}</dt>
                {price != null ? (
                  <dd className="sign chalk">
                    {price} <small>marks</small>
                  </dd>
                ) : (
                  <dd className="lot-sealed typed">sealed</dd>
                )}
                <span className="lot-source typed">
                  {price == null ? 'envelopes still sealed' : under ? `${lot.fairValue - price} marks under the board` : 'at or over the board'}
                  {identical && price != null ? ' · all five bid it' : ''}
                </span>
              </div>
            </dl>
            <p className="lot-sea typed">
              {sea ? (
                <span title={`${sea.source}, ${sea.at}`}>
                  Waves {sea.waveM.toFixed(1)} m{sea.swellM != null ? ` · swell ${sea.swellM.toFixed(1)} m` : ''} off{' '}
                  {sea.port.split(',')[0]} · {clock(sea.at)}
                </span>
              ) : (
                <span>Sea state not in yet</span>
              )}
              {token && (
                <>
                  <br />
                  Catch token {token.id} · {token.amount} kg ·{' '}
                  {token.transferTx ? (
                    <a href={txUrl(token.transferTx)} target="_blank" rel="noreferrer">
                      now held by {ownerName ?? token.owner} ↗
                    </a>
                  ) : (
                    <a href={txUrl(token.mintTx)} target="_blank" rel="noreferrer">
                      minted, held in escrow ↗
                    </a>
                  )}
                </>
              )}
            </p>
          </motion.div>
        ) : (
          <motion.p key="empty" className="lot-empty chalk" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            The zinc is empty. The boats are coming in.
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}
