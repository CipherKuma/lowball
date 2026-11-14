// BRIEF-3 F1 (real prices), F2 (sea state), F5 (tts tags), F6 (recap).
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../shared/api.js';
import { aggregate, FOSS_SPECIES, pickYear, type FossRow } from '../src/features/noaa.js';
import { recapText } from '../src/features/recap.js';
import { catchMultiplier, ensureSea, fetchSea, SEA_URL } from '../src/features/sea.js';
import { spell } from '../src/features/words.js';
import { createSession, getEvents, step } from '../src/game/engine.js';
import { GameCtx } from '../src/game/ctx.js';
import { fairValueFor, FAIR_VALUE_RANGE, lotFor, LB_PER_KG, MARKS_PER_USD, SPECIES, type PriceBook } from '../src/game/lots.js';
import { newState } from '../src/game/state.js';
import prices from '../src/generated/prices.json';
import { expressive, moodTag } from '../src/tts.js';
import { makeRig, PLAYER_PK, type Rig } from './helpers.js';

const row = (state: string, year: number, pounds: number | null, dollars: number | null): FossRow => ({ ts_afs_name: 'X', ts_scientific_name: null, state_name: state, year, pounds, dollars });

describe('F1 real prices', () => {
  it('prices.json has every species with a consistent, sourced entry', () => {
    const book = prices as Record<string, any>;
    for (const [key] of SPECIES) {
      const p = book[key];
      expect(p, `missing price for ${key}`).toBeTruthy();
      expect(p.usdPerLb).toBeGreaterThan(0.1);
      expect(p.usdPerLb).toBeLessThan(50);
      expect(p.usdPerLb).toBeCloseTo(p.dollars / p.pounds, 3);
      expect(p.year).toBeGreaterThanOrEqual(2023);
      expect(p.sourceUrl).toMatch(/^https:\/\/apps-st\.fisheries\.noaa\.gov\/ods\/foss\//);
      expect(p.query).toContain(FOSS_SPECIES[key]!.foss);
      expect(p.topState.state).toMatch(/^[A-Z -]+$/);
      expect(Date.parse(p.fetchedAt)).not.toBeNaN();
    }
    expect(Object.keys(FOSS_SPECIES).sort()).toEqual(SPECIES.map((s) => s[0]).sort());
  });

  it('fair value = weightKg x 2.20462 x usd/lb x MARKS_PER_USD', () => {
    expect(fairValueFor(100, 5)).toBe(Math.round(100 * 2.20462 * 5 * MARKS_PER_USD));
    const book: PriceBook = { halibut: { usdPerLb: 6.26, year: 2024, sourceUrl: 'https://x', topState: { state: 'MAINE' } } };
    for (let seed = 1; seed < 300; seed++) {
      const lot = lotFor(seed, 1 + (seed % 5), 1, book);
      if (lot.species !== 'halibut') continue;
      expect(lot.fairValue).toBe(Math.round(lot.weightKg * LB_PER_KG * 6.26 * MARKS_PER_USD));
      expect(lot.market).toEqual({ usdPerLb: 6.26, year: 2024, source: 'NOAA Fisheries FOSS', url: 'https://x', state: 'MAINE' });
      return;
    }
    throw new Error('no halibut lot found');
  });

  it('every species stays inside the promised 60-320 marks at both ends of its weight range', () => {
    const book = prices as PriceBook;
    for (const [species, , [lo, hi]] of SPECIES) {
      for (const kg of [lo, hi]) {
        const v = fairValueFor(kg, book[species]!.usdPerLb);
        expect(v, `${species} ${kg}kg`).toBeGreaterThanOrEqual(FAIR_VALUE_RANGE.min);
        expect(v, `${species} ${kg}kg`).toBeLessThanOrEqual(FAIR_VALUE_RANGE.max);
      }
    }
  });

  it('a species with no price falls back to the prior formula, flagged, for that species only', () => {
    const empty: PriceBook = {};
    const priced: PriceBook = prices as PriceBook;
    for (let seed = 1; seed < 80; seed++) {
      const a = lotFor(seed, 2, 1, empty);
      const b = lotFor(seed, 2, 1, priced);
      expect(a.species).toBe(b.species); // the price book never changes which fish or how heavy
      expect(a.weightKg).toBe(b.weightKg);
      expect(a.marketFallback).toBe(true);
      expect(a.market).toBeUndefined();
      expect(b.market).toBeDefined();
      expect(b.marketFallback).toBeUndefined();
    }
    const partial: PriceBook = { ...priced, lobster: undefined };
    const lots = Array.from({ length: 200 }, (_, i) => lotFor(i + 1, 1, 1, partial));
    expect(lots.filter((l) => l.species === 'lobster').every((l) => l.marketFallback)).toBe(true);
    expect(lots.filter((l) => l.species !== 'lobster').every((l) => l.market)).toBe(true);
  });

  it('aggregates dollars/pounds, skips unreported rows, names the top state', () => {
    const a = aggregate([row('MAINE', 2024, 100, 300), row('MASSACHUSETTS', 2024, 300, 1500), row('RHODE ISLAND', 2024, null, null), row('MAINE', 2023, 9, 9)], 2024)!;
    expect(a.pounds).toBe(400);
    expect(a.dollars).toBe(1800);
    expect(a.usdPerLb).toBe(4.5);
    expect(a.topState.state).toBe('MASSACHUSETTS');
    expect(aggregate([row('MAINE', 2024, null, null)], 2024)).toBeNull();
  });

  it('picks the latest year every species reports, skipping a partial one', () => {
    const full = { a: [row('X', 2024, 1000, 1), row('X', 2025, 900, 1)], b: [row('X', 2024, 1000, 1), row('X', 2025, 950, 1)] };
    expect(pickYear(full)).toBe(2025);
    expect(pickYear({ ...full, b: [row('X', 2024, 1000, 1), row('X', 2025, 300, 1)] })).toBe(2024); // 30% of last year: still filling
    expect(pickYear({ ...full, b: [row('X', 2024, 1000, 1)] })).toBe(2024); // missing in 2025
    expect(pickYear({ a: [] })).toBeNull();
  });
});

const seaJson = (wave: number | null) => ({ current: { time: '2026-11-14T08:45', wave_height: wave, swell_wave_height: 0.8, wind_wave_height: 0.3 } });
const okFetch = (wave: number | null) => (async () => new Response(JSON.stringify(seaJson(wave)), { status: 200 })) as unknown as typeof fetch;

describe('F2 sea state', () => {
  it('multiplier: calm 1, >= 2 m 0.75, >= 3.5 m 0.55', () => {
    expect([0, 1.99, 2, 3.49, 3.5, 6].map(catchMultiplier)).toEqual([1, 1, 0.75, 0.75, 0.55, 0.55]);
  });

  it('reads Open-Meteo marine for New Bedford', async () => {
    let url = '';
    const f = (async (u: string) => ((url = u), new Response(JSON.stringify(seaJson(2.4)), { status: 200 }))) as unknown as typeof fetch;
    const sea = (await fetchSea(f))!;
    expect(url).toBe(SEA_URL);
    expect(url).toContain('latitude=41.63&longitude=-70.92');
    expect(sea).toMatchObject({ waveM: 2.4, swellM: 0.8, port: 'New Bedford, MA', source: 'Open-Meteo Marine', catchMultiplier: 0.75 });
    expect(sea.at).toBe('2026-11-14T08:45Z');
  });

  it('times out after the budget and returns null (no multiplier)', async () => {
    const hang = ((_u: string, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch;
    const t0 = Date.now();
    expect(await fetchSea(hang, 25)).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('HTTP errors, missing numbers and bad JSON all give null', async () => {
    expect(await fetchSea((async () => new Response('x', { status: 500 })) as unknown as typeof fetch)).toBeNull();
    expect(await fetchSea(okFetch(null))).toBeNull();
    expect(await fetchSea((async () => new Response('not json')) as unknown as typeof fetch)).toBeNull();
  });

  async function begin(rig: Rig): Promise<{ id: string; events: GameEvent[] }> {
    const c = await createSession(rig.deps, PLAYER_PK, '1.1.1.1');
    await step(rig.deps, c.sessionId, 'begin');
    return { id: c.sessionId, events: (await getEvents(rig.deps, c.sessionId, 0)).events };
  }

  it('a rough season emits one sea event before day 1 and shrinks the catch', async () => {
    const calm = makeRig();
    const rough = makeRig();
    rough.deps.features = { seaFetch: okFetch(3.8) };
    const a = await begin(calm);
    const b = await begin(rough);
    const types = b.events.map((e) => e.type);
    expect(types.filter((t) => t === 'sea')).toHaveLength(1);
    expect(types.indexOf('sea')).toBeLessThan(types.indexOf('day_opened'));
    const sea = b.events.find((e) => e.type === 'sea') as Extract<GameEvent, { type: 'sea' }>;
    expect(sea).toMatchObject({ waveM: 3.8, catchMultiplier: 0.55, port: 'New Bedford, MA' });
    expect(a.events.map((e) => e.type)).not.toContain('sea');
    const day = (x: { events: GameEvent[] }) => x.events.find((e) => e.type === 'day_opened') as Extract<GameEvent, { type: 'day_opened' }>;
    // same seed would differ between rigs; compare against the formula instead
    const seed = (await rough.store.loadState(b.id))!.seed;
    const want = lotFor(seed, 1, 0.55);
    expect(day(b).weightKg).toBe(want.weightKg);
    expect(day(b).fairValue).toBe(want.fairValue);
    expect(day(b).market?.source).toBe('NOAA Fisheries FOSS');
  });

  it('a failed fetch means no event, no multiplier, and it is not retried', async () => {
    const rig = makeRig();
    let calls = 0;
    rig.deps.features = { seaFetch: (async () => (calls++, new Response('x', { status: 503 }))) as unknown as typeof fetch };
    const { id, events } = await begin(rig);
    expect(events.map((e) => e.type)).not.toContain('sea');
    expect((await rig.store.loadState(id))!.sea).toBeNull();
    const state = (await rig.store.loadState(id))!;
    await ensureSea(new GameCtx(id, state, rig.deps));
    expect(calls).toBe(1);
  });

  it('is an exact no-op when the feature is not wired', async () => {
    const rig = makeRig();
    const state = newState({ playerAccountId: 'p', playerPublicKey: 'k', contractId: 'c', buyers: [], days: 1, bondYocto: '1', seed: 1 });
    await ensureSea(new GameCtx('x', state, rig.deps));
    expect(state.sea).toBeUndefined();
  });
});

describe('F5 expressive tts tags (eleven_v4)', () => {
  it('maps mood to descriptive v4 voice-quality tags', () => {
    expect(moodTag('calm')).toBe('');
    expect(moodTag(undefined)).toBe('');
    expect(moodTag('tense')).toBe('[tense, low voice]');
    expect(moodTag('cold')).toBe('[cold, precise]');
    expect(['[nervous, breathless]', '[shaky, panicked]']).toContain(moodTag('cracking', 'abc'));
    expect(new Set(['a', 'ab'].map((t) => moodTag('cracking', t)))).toEqual(new Set(['[nervous, breathless]', '[shaky, panicked]']));
  });

  it('adds the buyer\'s voice quality, without repeating a word', () => {
    expect(moodTag('calm', '', 'marlow')).toBe('[gravelly]');
    expect(moodTag('tense', '', 'deacon')).toBe('[low voice, tense]');
    expect(moodTag('cold', '', 'odile')).toBe('[precise, cold]');
    expect(moodTag('cracking', 'ab', 'sully')).toBe('[nervous, breathless]');
  });

  it('tags the line, puts one ellipsis (no SSML or [pause] in v4) in longer lines, and strips tags the model wrote itself', () => {
    expect(expressive('Sixty is generous.', 'calm')).toBe('Sixty is generous.');
    expect(expressive('Quiet now.', 'cold')).toBe('[cold, precise] Quiet now.');
    const long = expressive('You walk in here, you lean on me, and you think I will sing for you?', 'tense');
    expect(long).toBe('[tense, low voice] You walk in here... you lean on me, and you think I will sing for you?');
    expect(long).not.toContain('[pause]');
    expect(expressive('[whispers] Keep your voice down, the walls here listen to everyone.', 'cold')).not.toContain('[whispers]');
  });
});

describe('F6 recap template', () => {
  it('speaks numbers as words in the narrator voice', () => {
    expect(spell(55)).toBe('fifty-five');
    expect(spell(18)).toBe('eighteen');
    expect(spell(240)).toBe('two hundred forty');
    const four = [60, 60, 60, 60, 41].map((amount, i) => ({ buyer: (['marlow', 'odile', 'sully', 'ines', 'deacon'] as const)[i]!, amount }));
    expect(recapText({ day: 2, species: 'halibut', fairValue: 55, price: 18, winner: 'ines', reveals: four })).toBe(
      'Day two. Halibut, fifty-five on the board. Sold for eighteen. Four envelopes, one number. Ines Varga took the catch.',
    );
    const diff = four.map((r, i) => ({ ...r, amount: 10 + i }));
    expect(recapText({ day: 1, species: 'Atlantic cod', fairValue: 120, price: 14, winner: null, reveals: diff })).toContain('Five envelopes, five numbers. Nobody took the catch.');
  });

  it('every settled lot is followed by one recap event, after lot_settled', async () => {
    const rig = makeRig();
    const c = await createSession(rig.deps, PLAYER_PK, '2.2.2.2');
    await step(rig.deps, c.sessionId, 'begin');
    await step(rig.deps, c.sessionId, 'sell');
    const evs = (await getEvents(rig.deps, c.sessionId, 0)).events;
    const t = evs.map((e) => e.type);
    expect(t.filter((x) => x === 'recap')).toHaveLength(1);
    expect(t.indexOf('recap')).toBeGreaterThan(t.indexOf('lot_settled'));
    const r = evs.find((e) => e.type === 'recap') as Extract<GameEvent, { type: 'recap' }>;
    expect(r.day).toBe(1);
    expect(r.text).toMatch(/^Day one\. .* on the board\. Sold for sixty\. Five envelopes, one number\./);
  });
});
