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
| `POST /api/session {playerPublicKey}` | creates the fisher account `p<6>.<house>` (function-call key, `offer_leniency` only, 0.05 NEAR). Returns `CreateSessionResponse`. |
| `GET  /api/session/:id/events?after=n` | `{events, status}`; poll about every 700 ms. |
| `POST /api/session/:id/step {action}` | `begin` (season, bonds, private cartel talk, day 1), `sell`, `hold`, `next_day`. Resumable: a failed step can simply be repeated. |
| `POST /api/session/:id/leniency {txHash}` | verifies the player's `offer_leniency` tx on-chain, then runs the deliberation race. |
| `GET  /api/session/:id/casefile` | sealed (409 `BAD_PHASE`) until the season is `closed`. |
| `GET  /api/tts?session=&seq=` | mp3 of a `line` event, buyer voice from `audio/voices.json`, cached in the Cache API. |

Errors are always `{error, code}`. Contract refusals keep their stable `E_*` codes; server codes are in
`ServerErrorCode`. Phases: `created -> lot_open <-> settled -> closed`. A step that is already running returns
409 `BUSY` (D1 lock, 170 s TTL). Leniency is available in `lot_open` and `settled` (the contract opens a
window per day). A confession closes the season. If fewer than two buyers sign the pact there is no cartel and
leniency ends in `holdout` (honest outcome, no model call).

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
`wrangler.toml`, `wrangler d1 migrations apply lowball --remote`, `wrangler secret put ...`, `wrangler deploy`.
Set `ALLOWED_ORIGIN` to the Pages origin. A `begin` takes tens of seconds; keep it under Cloudflare's 100 s
proxy timeout (it is resumable if it ever is not).

## Money

Bond 0.2 NEAR per buyer (`BOND_NEAR`). Buyers are funded 0.6 NEAR each by setup and topped up from the house
before each season (`ensureBuyerFunds`: bond + 0.15 NEAR gas reserve). Sessions refuse to start with
`TREASURY_LOW` when the house holds under `MIN_TREASURY_NEAR` (1.5). Slashed bonds go to the player account
(a house subaccount), so a confession season costs the house roughly 0.8 NEAR net.
