// F2: live sea state at New Bedford from Open-Meteo Marine (no key). Rough seas shrink the catch.
import type { SeaState } from '../../../shared/api.js';
import type { GameCtx } from '../game/ctx.js';
import { debug } from '../log.js';

export const SEA_URL =
  'https://marine-api.open-meteo.com/v1/marine?latitude=41.63&longitude=-70.92&current=wave_height,wind_wave_height,swell_wave_height';
export const SEA_TIMEOUT_MS = 3000;

/** calm 1.0; waves >= 2 m 0.75; >= 3.5 m 0.55 */
export function catchMultiplier(waveM: number): number {
  if (waveM >= 3.5) return 0.55;
  if (waveM >= 2) return 0.75;
  return 1;
}

function describe(waveM: number, swellM: number, mult: number): string {
  const mood = mult === 1 ? 'Calm enough to fish a full day.' : mult === 0.75 ? 'Rough; the boats come in light.' : 'Heavy sea; most of the fleet stayed home and the catches are thin.';
  return `Off New Bedford the waves are ${waveM.toFixed(1)} m with ${swellM.toFixed(1)} m of swell. ${mood}`;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** null on any failure (timeout, HTTP error, missing numbers): the caller then applies no multiplier and emits nothing. */
export async function fetchSea(fetchFn: typeof fetch = fetch, timeoutMs = SEA_TIMEOUT_MS): Promise<SeaState | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchFn(SEA_URL, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const j = (await res.json()) as { current?: { time?: string; wave_height?: unknown; swell_wave_height?: unknown; wind_wave_height?: unknown } };
    const wave = num(j.current?.wave_height);
    if (wave === null) return null;
    const swell = num(j.current?.swell_wave_height) ?? 0;
    const mult = catchMultiplier(wave);
    const at = typeof j.current?.time === 'string' ? `${j.current.time.replace(/Z$/, '')}Z` : new Date().toISOString();
    return { waveM: wave, swellM: swell, port: 'New Bedford, MA', source: 'Open-Meteo Marine', at, catchMultiplier: mult, text: describe(wave, swell, mult) };
  } catch (e) {
    debug('sea', 'fetch failed', String(e));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Once per season, before the first lot opens. Tried once: a failure leaves `sea` null (no multiplier, no event). */
export async function ensureSea(ctx: GameCtx): Promise<void> {
  const s = ctx.state;
  const f = ctx.deps.features?.seaFetch;
  if (!f || s.sea !== undefined) return;
  const sea = await fetchSea(f);
  s.sea = sea;
  if (sea) await ctx.emit({ type: 'sea', ...sea });
  await ctx.save();
}

export const seaMultiplier = (s: { sea?: SeaState | null }): number => s.sea?.catchMultiplier ?? 1;
