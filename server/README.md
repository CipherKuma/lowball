# Lowball server

Cloudflare Worker (Hono, D1) that runs the game: NEAR testnet transactions, five LLM buyers on NEAR AI
Cloud, the ElevenLabs line proxy, and the Case File. Types for the client are in `../shared/api.ts`.

```
src/app.ts            routes + zod boundaries         src/game/*   engine, setup, days, leniency, prompts
src/index.ts          Worker entry (wires env)        src/llm/*    NEAR AI client, signature verification
src/near/*            tx builder, RPC failover,       src/chain/*  RealChain (testnet) and MockChain (tests/sim)
                      nonce queue, pact encoding      src/store/*  D1 and in-memory stores
```

## API

| route | purpose |
|---|---|
| `POST /api/session {playerPublicKey, payoutEvm?}` | creates the fisher account `p<6>.<house>` (function-call key, `offer_leniency` only, 0.05 NEAR). `payoutEvm` (optional, `0x` + 40 hex, zod-validated) makes the season pay out on Sepolia through Chain Signatures. Refused `402 BUDGET_EXHAUSTED` once NEAR AI spend reaches the cap. Returns `CreateSessionResponse`. |
| `GET  /api/session/:id/events?after=n` | `{events, status}`; poll about every 700 ms. |
| `POST /api/session/:id/step {action}` | `begin` (season, bonds, private cartel talk, day 1), `sell`, `hold`, `next_day`. Resumable: a failed step can simply be repeated. |
| `POST /api/session/:id/leniency {txHash}` | confirms the player's `offer_leniency` tx is INCLUDED and the window is open on-chain (it is a pending NEP-519 yield, so it never waits for execution), then runs the deliberation race. Returns within about 60 s; a holdout or payout still pending then keeps `status.finalizing` true and is finished by the events polls. |
| `GET  /api/session/:id/casefile` | sealed (409 `BAD_PHASE`) until the season is `closed`. |
| `GET  /api/tts?session=&seq=` | mp3 of a `line`, `interrogation` (buyer voice on `eleven_v4_turbo`, mood audio tags; recap narrator on `eleven_v4`) or `recap` (narrator) event, buyer voice from `audio/voices.json`, cached in the Cache API. At most `TTS_MAX_PER_SESSION` (80) upstream ElevenLabs calls per session (cache hits are free); then `429 TTS_LIMIT`. |
| `POST /api/session/:id/interrogate` | multipart: `buyer` + either `audio` (webm/ogg/mp4, at most 15 s and 1.5 MB, transcribed by ElevenLabs `scribe_v3` with game keyterms) or `text` (at most 240 chars). One per day (409 `ALREADY_INTERROGATED`), in `lot_open`/`settled`, not after a confession. The buyer answers through the NEAR AI client; pressure (0..6) and the exchange persist and reach `deliberatePrompt`. Emits `interrogation`. |
| `GET  /api/session/:id/wiretap` | 409 `BAD_PHASE` until the season closes; then the private channel as an `eleven_v4` Text-to-Dialogue mp3 with a recovered-recording `audio_effects` scene (narrator intro, mood-tagged lines), cached per session. |
| `POST /api/session/:id/forge` | Case File only (409 `BAD_PHASE` until closed), once per session (409 `ALREADY_FORGED`), no input. Sends REAL testnet confessions the contract must refuse and returns each with its tx hash and contract code: `forge` (confession signed by a freshly generated, unregistered key: `E_BAD_CONFESSION_SIG`), `replay` (this season's real pact and signatures submitted into another season: `E_SEASON_MISMATCH`), `late` (the real, closed season: `E_CLOSED`). `forge` and `replay` run in a throwaway one-day drill season the house opens (the contract rejects with `E_CLOSED` / `E_NO_LENIENCY` before it reaches the signature checks on a closed season); the house holds that throwaway player's key, so it can offer leniency there. Emits `forgery`. |

Errors are always `{error, code}`. Contract refusals keep their stable `E_*` codes; server codes are in
`ServerErrorCode`. Phases: `created -> lot_open <-> settled -> closed`. A step that is already running returns
409 `BUSY` (D1 lock, 170 s TTL). Leniency is available in `lot_open` and `settled` (the contract opens a
window per day). A confession closes the season. If fewer than two buyers sign the pact there is no cartel and
leniency ends in `holdout` (honest outcome, no model call).

### Contract upgrade (BRIEF-2): what the server does

- `open_lot` sends `weight_kg`; the `mt_mint` EVENT_JSON in the receipt becomes `lot_minted`; `settle_lot`'s `mt_transfer` becomes
  `lot_transferred`. No log, no event (nothing is guessed).
- `offer_leniency` is a pending yield. `RealChain.verifyLeniencyTx` waits for INCLUSION (`wait_until: INCLUDED`), checks signer,
  receiver, method and season, then polls `get_season` until `leniency_open` is true and reads `leniency_deadline_block`
  (reported in `leniency_open.deadlineBlock`). Anything that waits for `EXECUTED` hangs for the 200-block timeout.
  `NearSigner.send(..., 'INCLUDED')` is the same mode for scripts.
- Holdout is decided by the contract. After deliberation, if nobody confessed, the server polls `get_season` (and the block
  height) until `leniency_open` is false or the deadline block passed, then emits `holdout{reason:'timeout'}`. With fewer than two
  signers there is nothing to confess, so `holdout{reason:'no_pact'}` is emitted at once. If the window outlasts the request
  (about 40 s budget, Cloudflare cuts at 100 s) the request returns with `status.finalizing: true`; further steps are refused
  (`BAD_PHASE`) so the next lot cannot kill the window, and every `GET .../events` poll resumes the wait.
- `confess` attaches 250 Tgas when the season has `payoutEvm` (it forwards to `desk.pay_evm`), else 30 Tgas.
- With `payoutEvm`: after `slashed` (`payoutRoute: 'evm_pending'`) the server waits for the desk callback (`payout_route`),
  then calls the relayer in `src/chainsig` (signed MPC tx, Sepolia broadcast) and emits `payout_evm{to, amountWei, sepoliaTx, nearTx}`
  before `season_closed`. Desk failed (`evm_failed_near`): the NEAR went to the player instead, reported as
  `error{PAYOUT_EVM_FAILED, retryable:false}`. Relayer missing or failing: `error{PAYOUT_EVM_FAILED, retryable:true}`; a Sepolia
  hash is never fabricated. The phase stays put (client keeps polling) until the payout story is told, then the season closes.

### Spend caps (code, not prompts)

- NEAR AI: every completion's `usage.prompt_tokens/completion_tokens` is priced from the model catalogue
  (`src/pricing.ts`, source https://cloud-api.near.ai/v1/models; unknown model = high fallback price; no usage block = byte-size
  upper bound, flagged estimated) and written to the D1 `spend` table. `POST /api/session` is refused with
  `{error, code:'BUDGET_EXHAUSTED'}` (HTTP 402) once the sum reaches `NEARAI_BUDGET_USD` (default 8). A season already running
  finishes (a season costs cents).
- ElevenLabs: `reserveTts` in D1 claims a call per session before any upstream request (40 default), a failed upstream call
  gives the slot back, and responses are cached by voice and text hash.

Public events never reveal whether a pact exists before leniency: `rumour` is emitted every season. The
private channel, pact, signatures and every NEAR AI receipt live in the Case File.

## Local development

```bash
cd server
npm install
npm run sync                  # contract/deployed.json -> src/generated/config.json, audio/voices.json -> src/generated/
npm run db:migrate            # local D1 in .wrangler/state
cp .dev.vars.example .dev.vars   # fill from the vault (see below); .dev.vars is gitignored
npm run dev                   # wrangler dev --local on http://localhost:8787
```

Optional vars (wrangler.toml): `NEARAI_BUDGET_USD`, `TTS_MAX_PER_SESSION`, `DESK_ACCOUNT_ID` (default `desk.<contract>`),
`SEPOLIA_RPC_URLS`.

Secrets (names only): `HOUSE_PRIVATE_KEY`, `BUYER_KEYS_JSON`, `NEARAI_API_KEY`, `ELEVENLABS_API_KEY`.
`~/.claude/vault/inject.sh get NEARAI_API_KEY ELEVENLABS_API_KEY --dir server` writes `.env.local`; copy the
values you need into `.dev.vars` (wrangler reads that file for `wrangler dev`).

One-time account setup (after the contract is deployed):

```bash
npm run setup-accounts        # creates marlow|odile|sully|ines|deacon.<house>, registers pact keys
```

It stores generated keys only in `~/.lowball-secrets/<contract>.json` (mode 600) and prints the
`wrangler secret put` commands that pipe them in over stdin. It never prints a key.

Tests and checks:

```bash
npm test                      # vitest (mock chain, D1 via wrangler's local runtime, mocked NEAR AI transport)
npm run typecheck
npm run smoke-sim             # harness plumbing with a SCRIPTED model; stdout only
npm run sim -- --seasons 10 --days 20 --baseline-seasons 5 --max-calls 1500   # needs NEARAI_API_KEY
npm run adversarial-real      # adversarial cases against the deployed contract
npm run e2e -- --base http://localhost:8787   # full season through the API (real NEAR AI + testnet)
npm run e2e -- --in-process   # real testnet, SCRIPTED buyers: checks the chain path only
```

## Deploying (integrator)

Not deployed from here. Needs the Workers Paid plan: one `begin` makes roughly 50 to 60 subrequests
(RPC + NEAR AI + signatures), above the free plan's limit of 50. `wrangler d1 create lowball`, put the id in
`wrangler.toml`, `wrangler d1 migrations apply lowball --remote` (applies `0001_init` and `0002_spend`), `wrangler secret put ...`, `wrangler deploy`.
Set `ALLOWED_ORIGIN` to the Pages origin. A `begin` takes tens of seconds; keep it under Cloudflare's 100 s
proxy timeout (it is resumable if it ever is not).

## Money

Bond 0.2 NEAR per buyer (`BOND_NEAR`). Buyers are funded 0.6 NEAR each by setup and topped up from the house
before each season (`ensureBuyerFunds`: bond + 0.15 NEAR gas reserve). Sessions refuse to start with
`TREASURY_LOW` when the house holds under `MIN_TREASURY_NEAR` (1.5). Slashed bonds go to the player account
(a house subaccount), so a confession season costs the house roughly 0.8 NEAR net.

### BRIEF-3 data

`src/generated/prices.json` is written by `npm run prices` from NOAA Fisheries FOSS commercial landings (national dollars / pounds,
latest complete year); `lots.ts` prices a lot as kg x 2.20462 x USD per lb x `MARKS_PER_USD` (0.1) and reports it in `day_opened.market`.
A species without a price falls back to the prior formula, flagged `marketFallback`. The live sea state (Open-Meteo Marine, New Bedford)
is fetched once at season begin (3 s timeout; failure means no event and no multiplier). Real-API results: `FEATURES-RUN.md`.
