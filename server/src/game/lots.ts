// Lot generation: deterministic from the session seed so a lot never depends on buyer behaviour.

export interface LotSpec {
  species: string;
  weightKg: number;
  fairValue: number;
}

/** [species, base marks per lot, kg range] */
const SPECIES: [string, number, [number, number]][] = [
  ['Atlantic cod', 110, [180, 320]],
  ['haddock', 90, [150, 260]],
  ['monkfish', 140, [60, 120]],
  ['turbot', 190, [40, 90]],
  ['sea bass', 170, [50, 110]],
  ['hake', 100, [160, 280]],
  ['mackerel', 70, [260, 480]],
  ['Dover sole', 160, [40, 80]],
  ['John Dory', 150, [30, 70]],
  ['bluefin tuna', 260, [90, 200]],
  ['lobster', 230, [25, 60]],
  ['king scallops', 200, [40, 90]],
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

export const FAIR_VALUE_RANGE = { min: 60, max: 300 };
