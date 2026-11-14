// NEAR AI Cloud token prices, USD per million tokens, used by the spend cap (never for billing).
// Source: the public model catalogue https://cloud-api.near.ai/v1/models (read 2026-11-14), the same
// numbers as https://docs.near.ai/cloud/models. A model missing here is priced at the fallback, which is
// deliberately high so the cap errs on the safe side.
export const NEARAI_PRICING_SOURCE = 'https://cloud-api.near.ai/v1/models';

export interface TokenPrice {
  /** USD per 1M prompt tokens */
  in: number;
  /** USD per 1M completion tokens */
  out: number;
}

export const NEARAI_PRICE_PER_M: Record<string, TokenPrice> = {
  'z-ai/glm-5.3-flash': { in: 0.08, out: 0.5 },
  'Qwen/Qwen3.6-35B-A3B-FP8': { in: 0.17, out: 1.1 },
  'Qwen/Qwen3.8-27B': { in: 0.04, out: 1.35 },
};

export const FALLBACK_PRICE: TokenPrice = { in: 3, out: 15 };

/** Default cap on cumulative NEAR AI spend across all sessions (USD). Override with NEARAI_BUDGET_USD. */
export const DEFAULT_NEARAI_BUDGET_USD = 8;
/** Default cap on upstream ElevenLabs calls per session. Override with TTS_MAX_PER_SESSION. */
export const DEFAULT_TTS_MAX_PER_SESSION = 40;

export function priceOf(model: string): TokenPrice {
  return NEARAI_PRICE_PER_M[model] ?? FALLBACK_PRICE;
}

export function costUsd(model: string, promptTokens: number, completionTokens: number): number {
  const p = priceOf(model);
  return (promptTokens * p.in + completionTokens * p.out) / 1_000_000;
}
