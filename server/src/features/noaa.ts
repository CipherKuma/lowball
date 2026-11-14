// NOAA Fisheries FOSS commercial landings -> ex-vessel USD per lb. Pure aggregation (the script does the fetching).

export interface FossRow {
  ts_afs_name: string;
  ts_scientific_name: string | null;
  state_name: string;
  year: number;
  pounds: number | null;
  dollars: number | null;
}

/** Game species key (the string lots.ts and the token title use) -> the FOSS record that prices it. */
export const FOSS_SPECIES: Record<string, { foss: string; scientific: string }> = {
  'Atlantic cod': { foss: 'COD, ATLANTIC', scientific: 'Gadus morhua' },
  halibut: { foss: 'HALIBUT, ATLANTIC', scientific: 'Hippoglossus hippoglossus' },
  monkfish: { foss: 'GOOSEFISH', scientific: 'Lophius americanus' },
  'bluefin tuna': { foss: 'TUNA, BLUEFIN', scientific: 'Thunnus thynnus' },
  'sea bass': { foss: 'BASS, BLACK SEA', scientific: 'Centropristis striata' },
  lobster: { foss: 'LOBSTER, AMERICAN', scientific: 'Homarus americanus' },
};

export interface PriceEntry {
  usdPerLb: number;
  year: number;
  pounds: number;
  dollars: number;
  topState: { state: string; usdPerLb: number; pounds: number; dollars: number };
  sourceUrl: string;
  query: string;
  fetchedAt: string;
}

/** Sum rows that report both pounds and dollars (a null is "not reported", never a zero). */
export function aggregate(rows: FossRow[], year: number): Omit<PriceEntry, 'sourceUrl' | 'query' | 'fetchedAt'> | null {
  const byState = new Map<string, { pounds: number; dollars: number }>();
  for (const r of rows) {
    if (r.year !== year || r.pounds === null || r.dollars === null || !(r.pounds > 0) || !(r.dollars > 0)) continue;
    const s = byState.get(r.state_name) ?? { pounds: 0, dollars: 0 };
    s.pounds += r.pounds;
    s.dollars += r.dollars;
    byState.set(r.state_name, s);
  }
  if (byState.size === 0) return null;
  let pounds = 0;
  let dollars = 0;
  let top: [string, { pounds: number; dollars: number }] | null = null;
  for (const e of byState) {
    pounds += e[1].pounds;
    dollars += e[1].dollars;
    if (!top || e[1].dollars > top[1].dollars) top = e;
  }
  const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
  return {
    usdPerLb: round(dollars / pounds, 4),
    year,
    pounds: Math.round(pounds),
    dollars: Math.round(dollars),
    topState: { state: top![0], usdPerLb: round(top![1].dollars / top![1].pounds, 4), pounds: Math.round(top![1].pounds), dollars: Math.round(top![1].dollars) },
  };
}

export function reportedPounds(rows: FossRow[], year: number): number {
  return rows.reduce((a, r) => (r.year === year && r.pounds && r.dollars ? a + r.pounds : a), 0);
}

/**
 * Latest year in which every species reports data and no species fell below `minRatio` of its prior-year
 * pounds (a preliminary, still-filling year looks like that). Null when no year qualifies.
 */
export function pickYear(all: Record<string, FossRow[]>, minRatio = 0.6): number | null {
  const years = new Set<number>();
  for (const rows of Object.values(all)) for (const r of rows) years.add(r.year);
  for (const y of [...years].sort((a, b) => b - a)) {
    const ok = Object.values(all).every((rows) => {
      const cur = reportedPounds(rows, y);
      if (cur <= 0) return false;
      const prev = reportedPounds(rows, y - 1);
      return prev <= 0 || cur >= prev * minRatio;
    });
    if (ok) return y;
  }
  return null;
}
