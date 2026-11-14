import type { BuyerId, Mood } from '../../../shared/api';

/**
 * Event shapes added in brief 3 (real prices, sea state, interrogation, recaps). Declared locally so
 * the client compiles before and after the server adds them to shared/api.ts.
 */
export interface Market {
  usdPerLb: number;
  year: number;
  source: string;
  url: string;
  state?: string;
}
export interface Sea {
  waveM: number;
  swellM: number | null;
  port: string;
  source: string;
  at: string;
}
export interface Interrogation {
  seq: number;
  buyer: BuyerId;
  question: string;
  answer: string;
  mood: Mood;
  tell: string;
  pressure: number;
}

export type ExtraEvent =
  | { type: 'sea'; seq: number; waveM: number; swellM: number | null; port: string; source: string; at: string }
  | { type: 'interrogation'; seq: number; buyer: BuyerId; question: string; answer: string; mood: Mood; tell: string; pressure: number }
  | { type: 'recap'; seq: number; text: string };

export interface ExtraView {
  sea: Sea | null;
  interrogations: Interrogation[];
  pressure: Partial<Record<BuyerId, number>>;
  recaps: { seq: number; text: string }[];
}

export const initialExtra: ExtraView = { sea: null, interrogations: [], pressure: {}, recaps: [] };

export function applyExtra<V extends ExtraView>(v: V, e: ExtraEvent): V {
  switch (e.type) {
    case 'sea':
      return { ...v, sea: { waveM: e.waveM, swellM: e.swellM, port: e.port, source: e.source, at: e.at } };
    case 'interrogation':
      return {
        ...v,
        interrogations: [...v.interrogations, { seq: e.seq, buyer: e.buyer, question: e.question, answer: e.answer, mood: e.mood, tell: e.tell, pressure: e.pressure }],
        pressure: { ...v.pressure, [e.buyer]: e.pressure },
      };
    case 'recap':
      return { ...v, recaps: [...v.recaps, { seq: e.seq, text: e.text }].slice(-8) };
    default:
      return v;
  }
}

/** The market block that brief-3 servers attach to day_opened (absent on older servers). */
export function marketOf(e: unknown): Market | null {
  const m = (e as { market?: Market }).market;
  return m && typeof m.usdPerLb === 'number' ? m : null;
}
