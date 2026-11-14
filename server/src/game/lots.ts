// Lot generation: deterministic from the session seed so a lot never depends on buyer behaviour.

export interface LotSpec {
  species: string;
  weightKg: number;
  fairValue: number;
}

/**
 * [species, base marks per lot, kg range]. Exactly the six species that have art (art/final); a lot never
 * names a fish the client cannot draw. The string is also the on-chain token title.
 */
export const SPECIES: [string, number, [number, number]][] = [
  ['Atlantic cod', 110, [180, 320]],
  ['halibut', 210, [60, 140]],
  ['monkfish', 140, [60, 120]],
  ['bluefin tuna', 260, [90, 200]],
  ['sea bass', 170, [50, 110]],
  ['lobster', 230, [25, 60]],
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

export function lotFor(seed: number, day: number): LotSpec {
  const r = rng(seed * 7919 + day * 104729);
  const [species, base, [kgLo, kgHi]] = SPECIES[Math.floor(r() * SPECIES.length)]!;
  const weightKg = Math.round(kgLo + r() * (kgHi - kgLo));
  const fairValue = Math.round(base * (0.88 + r() * 0.3));
  return { species, weightKg, fairValue };
}

export const FAIR_VALUE_RANGE = { min: 60, max: 320 };
