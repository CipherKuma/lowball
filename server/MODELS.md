# Buyer model

**Default: `z-ai/glm-5.3-flash` (GLM 5.3 Flash)** on NEAR AI Cloud (`https://cloud-api.near.ai/v1`, OpenAI-compatible
`POST /chat/completions`). Set by `NEARAI_MODEL` in `wrangler.toml`; the Worker, the sim and
`npm run verify-attestation` all read it.

## Why this model, and why not Claude Haiku 5.5

The previous default, `anthropic/claude-haiku-5-5`, is an **Incognito**-tier model. NEAR AI's own docs
(<https://docs.near.ai/cloud/models>): Incognito models are "routed through the NEAR AI Gateway, which runs in a TEE, and
sent to the provider under NEAR AI's provider account. ... The model itself runs on the provider's infrastructure, outside
a TEE, so the TEE privacy and verifiability guarantees do not extend to the upstream provider." That made "verifiable
buyers" false, so it is gone.

GLM 5.3 Flash is in the **Confidential TEE** tier: "models run on NEAR AI's own GPU fleet inside Trusted Execution
Environments", with attestation, signatures and verification. Tier evidence, read 2026-11-14:

| evidence | where |
|---|---|
| tier definitions | <https://docs.near.ai/cloud/models> |
| `owned_by: "nearai"` (own fleet; Anthropic ids say `anthropic`, third-party TEE says `attested 3p`) | <https://cloud-api.near.ai/v1/models> (public, no key) |
| `supported_features: tools, structured_outputs, reasoning, json_mode`, `is_ready: true`, $0.08 in / $0.50 out per M tokens, fp8 | same catalogue entry |
| Intel TDX quotes and NVIDIA GPU evidence for this model verified by us | `evidence/attestation-z-ai-glm-5.3-flash-2026-11-14.json` (re-run to refresh) |

Candidates in the own-fleet tier (`owned_by: nearai`) and the call:

| model id | structured outputs | note |
|---|---|---|
| `z-ai/glm-5.3-flash` | yes (+ json_mode) | **chosen**: cheapest, MoE "Flash", the id NEAR's SDK docs use for attestation examples |
| `Qwen/Qwen3.6-35B-A3B-FP8` | yes (+ json_mode) | runner-up: about 3B active parameters, described as fast; $0.17 / $1.10 |
| `Qwen/Qwen3.8-27B` | yes | dense 27B, expected slower; $0.04 / $1.35 |
| `deepseek-ai/DeepSeek-V4.1-Flash-1017` | no (tools, reasoning only) | own fleet but cannot enforce a JSON schema |

The similarly named `deepseek/deepseek-v4.1-flash*` ids are **not** the own-fleet models (provider `deepseek`, Incognito):
select by id and `owned_by`, never by marketing name. Switching: change `NEARAI_MODEL`, then run the verification command
below; the Case File shows "not verified" until the evidence matches the configured model.

**Not measured:** "fastest" is a judgment from the catalogue (MoE, flash class), not a benchmark. No NEAR AI API key was
available, so no live completion was timed or checked against the strict `json_schema` format. If the live check shows
GLM too slow or sloppy with schemas, try the Qwen3.6 A3B runner-up (two-line change plus re-verification).

## Attestation: what is verified, and how it reaches the Case File

```
cd server
npm run verify-attestation               # attestation reads are public: no API key needed
# live check, once the key exists (adds one real completion, its signature, latency and the Case File verdict):
~/.claude/vault/inject.sh get NEARAI_API_KEY --dir server && npm run verify-attestation -- --live
```

`--live` exits 0 only if the response was a `provider_tee` signature, verified, `quoteVerified`, and the Case File
attestation is `verified`. Without a key it prints how to get one and exits 1; nothing is faked.

`scripts/verify-attestation.ts` requests `GET /v1/attestation/report?model=<id>&provider=near&signing_algo=ecdsa&nonce=<32 random bytes>`
and, for the gateway report and **every** model candidate (fail closed if any fails), checks:

| check | status |
|---|---|
| Intel TDX quote: certificate chain and TCB info/QE identity collateral (`@phala/dcap-qvl`, collateral from Phala PCCS) | verified; TCB status must be `UpToDate` |
| TDX debug mode off | verified |
| quote `report_data` = signer identity + our fresh nonce; echoed nonce matches | verified |
| MRCONFIGID = `01 ‖ sha256(app_compose) ‖ 0^15` | verified |
| RTMR3 replayed from the event log equals the quote's RTMR3 | verified |
| NVIDIA GPU evidence: payload nonce matches, NRAS verdict `x-nvidia-overall-att-result` is true, **verdict JWT signature checked against NVIDIA's JWKS**, per-GPU tokens checked | verified |
| Worker response signature (`provider_tee`): signer equals a model signer from a report fetched **before** the completion, and the signature is valid over the exact request and response bytes | verified per response |

Not verified, and recorded under `notChecked` in the evidence file: measurements against an approved allowlist (NEAR AI
publishes none we could pin; they are only recorded), image provenance, TLS endpoint binding, and which serving instance
answered (instances of a model share one signing key). Evidence is a point in time (`checkedAt`).

How the Worker uses it (`src/llm/*`): the Worker does **not** verify Intel quotes. Before a season it fetches the same
report and runs the offline checks (nonce, signer binding, MRCONFIGID, RTMR3) to collect trusted model signers. A receipt's
`quoteVerified` is true only if the response signature is `provider_tee`, verified, and its signer is a signer the last
full evidence run proved (`src/llm/attestation-evidence.json`, written by the script, bundled with the Worker). The Case
File's `attestation: {verified, checkedAt, evidenceUrl, reason?}` is true only if that evidence passed for the configured
model and the live signer is in it; a rotated key or another model shows `verified: false` with a reason. Re-run the script
after any model change and before the demo, then redeploy.

## Notes

- The catalogue lists `temperature`, `top_p` and others for GLM 5.3 Flash; the client sends only `max_tokens` and
  `response_format`. Variety comes from the five personalities and the real game state.
- The model is a reasoning model. If it spends tokens thinking, raise `maxTokens` per call rather than lowering strictness.
- If the gateway rejects `response_format` for a model, the client drops it once and relies on the prompt-enforced JSON
  plus zod validation (one retry on invalid JSON, then an `error` event).
- Every request sends `x-no-aliasing: true` and the canonical model id, as the signature text requires.
