// Writes src/generated/prices.json from NOAA Fisheries FOSS commercial landings. Usage: npm run prices
// Never invents a number: a species with no usable rows is left out (lots.ts then uses its flagged fallback).
import { writeFileSync } from 'node:fs';
import { aggregate, FOSS_SPECIES, pickYear, type FossRow, type PriceEntry } from '../src/features/noaa.js';

const BASE = 'https://apps-st.fisheries.noaa.gov/ods/foss/landings/';
const OUT = new URL('../src/generated/prices.json', import.meta.url).pathname;

async function fetchAll(fossName: string): Promise<{ rows: FossRow[]; query: string }> {
  const query = JSON.stringify({ ts_afs_name: fossName, collection: 'Commercial' });
  const rows: FossRow[] = [];
  for (let offset = 0; offset < 20000; offset += 500) {
    const url = `${BASE}?q=${encodeURIComponent(query)}&limit=500&offset=${offset}`;
    const res = await fetch(url, { headers: { 'user-agent': 'lowball-hackathon/1.0 (fisheries price lookup)' } });
    if (!res.ok) throw new Error(`FOSS ${res.status} for ${fossName}`);
    const j = (await res.json()) as { items: FossRow[]; hasMore: boolean };
    rows.push(...j.items);
    if (!j.hasMore) break;
  }
  return { rows, query };
}

const all: Record<string, FossRow[]> = {};
const queries: Record<string, string> = {};
for (const [key, spec] of Object.entries(FOSS_SPECIES)) {
  const r = await fetchAll(spec.foss);
  // keep the exact species (Atlantic bluefin shares a FOSS name with nothing else, but check the scientific name)
  all[key] = r.rows.filter((x) => !x.ts_scientific_name || x.ts_scientific_name === spec.scientific);
  queries[key] = r.query;
  console.log(`${key}: ${all[key]!.length} rows`);
}
const year = pickYear(all);
if (year === null) throw new Error('no year in which every species reports data');

const fetchedAt = new Date().toISOString();
const out: Record<string, PriceEntry> = {};
const missing: string[] = [];
for (const [key, rows] of Object.entries(all)) {
  const a = aggregate(rows, year);
  if (!a) {
    missing.push(key);
    continue;
  }
  out[key] = { ...a, sourceUrl: BASE, query: `${queries[key]} year=${year}`, fetchedAt };
}
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`year ${year}`);
for (const [k, v] of Object.entries(out)) console.log(`${k.padEnd(14)} $${v.usdPerLb.toFixed(2)}/lb  ${v.pounds} lb  $${v.dollars}  top ${v.topState.state}`);
if (missing.length) console.log(`MISSING (fallback flagged in the game): ${missing.join(', ')}`);
