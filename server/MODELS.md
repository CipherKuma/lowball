# Buyer model

**Default: `anthropic/claude-haiku-5-5`** on NEAR AI Cloud (`https://cloud-api.near.ai/v1`, OpenAI-compatible
`POST /chat/completions`). Override with the `NEARAI_MODEL` var; the sim and the Worker both read it.

Why (from the live `GET /v1/models` catalogue, read 2026-11-14):

| need | Haiku 5.5 |
|---|---|
| fast: five concurrent buyers per day, 25+ calls per season | Anthropic's fastest tier |
| structured outputs (`response_format: json_schema`, strict) | `supported_features` includes `structured_outputs` |
| cheap enough for ~1500 sim calls | $0.10 per M input tokens, $0.50 per M output |
| long enough for the prompts (bond, history, channel memory) | 1M context |
| capable of in-character judgment with real numbers | near-frontier per the catalogue description |

Runners-up if Haiku misbehaves on a schema: `openai/gpt-6-luna` ($0.10/$0.50), `z-ai/glm-5.3-flash`
($0.08/$0.50, `json_mode` + `structured_outputs`), `deepseek/deepseek-v4.1-flash`.

Notes
- The catalogue lists `max_tokens` and `stop` as the only sampling parameters for this model, so no
  `temperature` is sent. Variety comes from the five personalities and the real game state.
- If the gateway rejects `response_format` for a model, the client drops it once and relies on the
  prompt-enforced JSON plus zod validation (one retry on invalid JSON, then an `error` event).
- Not verified against a live completion: the NEAR AI API key was not available when this was written
  (see TEST-RESULTS.md). The model id, request shape and signature flow follow the NEAR AI docs.
