// Lot generation: deterministic from the session seed so a lot never depends on buyer behaviour.
// Fair value comes from real NOAA Fisheries ex-vessel prices (src/generated/prices.json, scripts/fetch-noaa-prices.ts).
import prices from '../generated/prices.json';

export interface LotMarket {
  usdPerLb: number;
  year: number;
  source: 'NOAA Fisheries FOSS';
  url: string;
  /** the state with the most landed value that year */
  state?: string;
}

export interface LotSpec {
  species: string;
  weightKg: number;
  fairValue: number;
  /** the real price behind fairValue; absent when the species had no FOSS price and the prior formula was used */
  market?: LotMarket;
  /** true when fairValue came from the prior formula (no NOAA price for this species) */
  marketFallback?: true;
}

export interface PriceBook {
  [species: string]: { usdPerLb: number; year: number; sourceUrl: string; topState?: { state: string } } | undefined;
}

/**
 * Game units: 1 mark = 10 USD at the dock (MARKS_PER_USD = 0.1). With the kg ranges below a lot lands at about
 * 80 to 320 marks, the span the buyer prompts promise (FAIR_VALUE_RANGE). Never change one without the other.
 */
export const MARKS_PER_USD = 0.1;
export const LB_PER_KG = 2.20462;

/**
 * [species, fallback marks per lot (the prior formula, used only when prices.json has no price), kg range].
 * Exactly the six species that have art (art/final); a lot never names a fish the client cannot draw. The string
 * is also the on-chain token title. Weights are one day's landing: a boat lands a tonne of monkfish (about 70
 * cents a pound) but a couple of hundred kilos of halibut or bluefin.
 */
export const SPECIES: [string, number, [number, number]][] = [
  ['Atlantic cod', 150, [250, 450]],
  ['halibut', 210, [100, 200]],
  ['monkfish', 180, [900, 1500]],
  ['bluefin tuna', 240, [150, 300]],
  ['sea bass', 190, [200, 450]],
  ['lobster', 210, [100, 200]],
];

/** mulberry32 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** fair value in marks: weight in lb x real USD per lb x MARKS_PER_USD */
export function fairValueFor(weightKg: number, usdPerLb: number): number {
  return Math.max(1, Math.round(weightKg * LB_PER_KG * usdPerLb * MARKS_PER_USD));
}

/**
 * @param weightMult sea-state multiplier on the catch (1 = calm), applied to the weight before pricing
 * @param book       price book, injectable for tests (defaults to the generated NOAA file)
 */
export function lotFor(seed: number, day: number, weightMult = 1, book: PriceBook = prices as PriceBook): LotSpec {
  const r = rng(seed * 7919 + day * 104729);
  const [species, base, [kgLo, kgHi]] = SPECIES[Math.floor(r() * SPECIES.length)]!;
  const weightKg = Math.max(1, Math.round((kgLo + r() * (kgHi - kgLo)) * weightMult));
  const jitter = 0.88 + r() * 0.3; // always drawn, so the weight and species of a lot never depend on the price book
  const p = book[species];
  if (p && Number.isFinite(p.usdPerLb) && p.usdPerLb > 0) {
    const market: LotMarket = { usdPerLb: p.usdPerLb, year: p.year, source: 'NOAA Fisheries FOSS', url: p.sourceUrl };
    if (p.topState?.state) market.state = p.topState.state;
    return { species, weightKg, fairValue: fairValueFor(weightKg, p.usdPerLb), market };
  }
  return { species, weightKg, fairValue: Math.round(base * jitter * weightMult), marketFallback: true };
}

export const FAIR_VALUE_RANGE = { min: 60, max: 320 };
