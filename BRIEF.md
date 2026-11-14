# Lowball — build brief (agent contract; terse)

Event: NEAR Hackathon (Games track; also fits Agents). Deadline 2026-11-14T23:59Z (hard).
Owner/integrator: Opus session. Repo: ~/Documents/hackathons/near-lowball. Persona: CipherKuma
(repo-local git identity already set; never change it; never `git add -A`; commit by path).
Network: NEAR **testnet only**. No mainnet, no real money, no paid sign-ups.

## Game in one paragraph
You are a fisher (boat "Marguerite"). Each day of a season you land one lot. Five AI buyers bid
on it via commit-reveal. Before the season the buyers privately form a cartel and each signs an
ed25519 pact ("bid no more than CAP"). Bids come back identical and low. You can offer
**leniency**: the FIRST buyer who hands the signed pact to the contract gets immunity (bond
refunded); every other verified signer's bond is slashed and paid to you. A second confession is
refused on-chain. Buyers are real LLM agents on NEAR AI Cloud deciding from real payoffs; every
decision carries a NEAR AI signed receipt shown in the end-of-game Case File.

## Ownership (no one edits another's files)
| Path | Owner |
|---|---|
| `contract/` (Rust, near-sdk) | contract agent (Sonnet) |
| `server/` (Cloudflare Worker, TS) + `shared/api.ts` | server agent (Sonnet) |
| `audio/`, `web/public/audio/` | audio agent (Sonnet) |
| `art/raw/` | Codex image job |
| `web/` (everything except `web/public/audio`), `art/final/` | Opus |
| `BRIEF.md`, `README.md`, `scripts/deploy*` top level | Opus |

## Cast (ids are stable keys everywhere)
| id | name | look | play |
|---|---|---|---|
| marlow | Marlow Teague | old harbour boss, bowler hat, scarred hands | ringleader; proud; confesses last, only when betrayal looks certain |
| odile | Odile Fenn | cannery accountant, round glasses, ledger | pure expected-value calculator; confesses when the numbers say so |
| sully | Sully Brack | young dock buyer, sweating, cap | anxious; loss-averse; most likely to crack early |
| ines | Ines Varga | restaurateur, red lipstick, fur collar | charming, two-faced; will sell out others for a better deal |
| deacon | The Deacon | silent middleman, clerical collar, cigarette | loyal to the ring; nearly never confesses; few words |

## Contract `contract/` — interface (implement exactly; add views as needed)
Units: bonds in yoctoNEAR (U128 JSON strings). Fish prices in integer "marks" (game units).
- `new(house: AccountId)` init. House = server account; owner-only methods check it.
- `register_buyer_key(public_key: Base64VecU8 /*32 bytes ed25519*/)` called by the buyer account.
- `create_season(player, buyers: Vec<AccountId> /*5*/, days: u8, bond: U128) -> u64` house only.
  Each buyer must have a registered key.
- `post_bond(season_id)` #[payable], buyer only, attached == bond, once.
- `open_lot(season_id, species: String, fair_value: u32)` house only; requires all bonds posted;
  one open lot at a time; day += 1; day <= days.
- `commit_bid(season_id, hash: Base64VecU8)` buyer; hash = sha256(amount_le_u32 ‖ salt32).
- `reveal_bid(season_id, amount: u32, salt: Base64VecU8)` buyer; must match commit.
- `settle_lot(season_id)` anyone once all 5 revealed (or house after deadline). Records winner
  (highest; tie → earliest reveal), price, `identical: bool` (all reveals equal), and
  `shortfall += fair_value - price` (floored at 0).
- `offer_leniency(season_id)` **player only** (the player signs this in-browser). Opens window
  for the current day. Idempotent per day.
- `confess(season_id, pact: Pact, signatures: Vec<PactSig>)`; caller = a season buyer.
  `Pact { season_id: u64, cap: u32, members: Vec<AccountId>, nonce: u64 }`,
  `PactSig { signer: AccountId, signature: Base64VecU8 /*64*/ }`.
  Message = `b"LOWBALL-PACT-v1:" ++ borsh(pact)`. Verify each sig with
  `env::ed25519_verify(&sig, &msg, &registered_pk)`. Refuse (panic with stable error codes):
  `E_NO_LENIENCY` window not open; `E_SEASON_MISMATCH` pact.season_id != season;
  `E_NOT_BUYER` caller not in season; `E_NOT_MEMBER` caller not in pact.members or member not in
  season; `E_DUP_SIGNER`; `E_BAD_SIG` any invalid/forged signature; `E_TOO_FEW` < 2 valid member
  sigs or caller's own sig missing; `E_ALREADY_CONFESSED` (second confession);
  `E_CLOSED` season closed.
  On success (first only): status=Confessed, first_confessor=caller, verified_signers recorded,
  each verified signer except caller: bond slashed; caller bond refunded (immunity);
  slashed total transferred to player via Promise; record `player_payout`, `confessed_day`,
  pact cap and nonce. Non-signer buyers keep bonds (refundable at close).
- `withdraw_bond(season_id)` buyer; `E_SEASON_OPEN` while status Open; slashed → `E_SLASHED`.
- `close_season(season_id)` house, or anyone after last lot settled. Refund unslashed bonds.
- Views: `get_season(season_id) -> SeasonView` (player, buyers, bond, day, days, status,
  lots[{day,species,fair_value,reveals[{buyer,amount}],winner,price,identical}], leniency_day,
  first_confessor, verified_signers, slashed_total, player_payout, shortfall, pact_cap),
  `get_buyer_key(account)`, `get_config()`.
Tests (required, all must pass): unit tests + near-workspaces sandbox integration covering every
error code above, replay of a pact signed for another season, signature by unregistered key,
pact including a non-season account, duplicate signer, exact balance accounting (player gets
exactly slashed sum; confessor refunded; non-signer refunded at close), bid commit/reveal
mismatch, double commit, bid before bond, open_lot past days, non-house calls, non-player
offer_leniency, confession race (two confess txs in same block → one succeeds).
Deploy: `scripts/deploy-contract.sh` creates/uses `lowball-ck.testnet` (or sibling if taken) via
near CLI faucet sponsorship, deploys, `new`. Record ids in `contract/deployed.json` (no keys).

## Server `server/` — Cloudflare Worker (TS, Hono ok), D1 for session state
Secrets (wrangler secrets, never in files): HOUSE_PRIVATE_KEY, BUYER_KEYS_JSON (NEAR full-access
keys of 5 buyer subaccounts + 5 ed25519 pact keys), NEARAI_API_KEY, ELEVENLABS_API_KEY.
Accounts: house `<house>.testnet`; buyers `marlow.<house>.testnet`, …; players
`p<6char>.<house>.testnet` created by house with the **browser-generated public key** as a
function-call key restricted to the contract (+ 0.05 NEAR for gas). Handle nonce contention
(per-buyer queue; retries on InvalidNonce).
API (types live in `shared/api.ts`; zod-validate every input; errors `{error, code}`):
- `POST /api/session {playerPublicKey}` → `{sessionId, playerAccountId, contractId, seasonId|null,
  buyers:[{id,name,accountId}], days, bondYocto}`; work continues async (waitUntil / alarms
  not allowed — use request-driven steps) — see events.
- `GET /api/session/:id/events?after=n` → `{events: GameEvent[], status}`. Client polls ~700ms.
- `POST /api/session/:id/step {action:'begin'|'sell'|'hold'|'next_day'}` advances one phase.
- `POST /api/session/:id/leniency {txHash}` server verifies the player's `offer_leniency` tx
  on-chain, then runs the deliberation round; any buyer deciding to confess submits `confess`
  concurrently → contract picks first; others get `E_ALREADY_CONFESSED` (real race).
- `GET /api/session/:id/casefile` → private channel transcript, pact JSON, signatures, every
  NEAR AI chat id + signature + verification result, every tx hash.
- `GET /api/tts?session=:id&seq=:n` → mp3 for a `line` event (ElevenLabs, voice per buyer from
  `audio/voices.json`; cache).
GameEvent union (`type` field): `account_created{accountId,tx}`, `season_created{seasonId,tx}`,
`bond_posted{buyer,tx}`, `cartel_forming{}`, `pact_signed{count}` (public: only that *a* pact
exists is NOT revealed — emit as `rumour{text}`), `day_opened{day,species,weightKg,fairValue,tx}`,
`bid_committed{buyer,tx}`, `bids_revealed{reveals[{buyer,amount,tx}],identical}`,
`lot_settled{winner,price,shortfall,tx}`, `line{buyer,text,mood:'calm'|'tense'|'cracking'|'cold'}`,
`leniency_open{tx}`, `deliberating{buyer}`, `confession_attempt{buyer,ok,errorCode?,tx}`,
`slashed{confessor,slashed:[{buyer,yocto}],payoutYocto,tx}`, `holdout{}` (nobody confessed),
`season_closed{tx}`, `error{code,message,retryable}`.
Buyer agents (NEAR AI Cloud, OpenAI-compatible `POST /v1/chat/completions`, pick a fast capable
model from https://docs.near.ai/cloud/models.md; fetch `GET /v1/signature/{chat_id}` and verify
per https://docs.near.ai/cloud/verification/reference/response-signature-verification.md).
JSON-schema structured outputs: cartel talk {say, propose_cap, sign}, bid {amount, say},
deliberate {confess:boolean, say, reasoning}. Prompts carry real numbers: bond, cap, fair value,
shortfall so far, leniency terms, identical-bid streak (evidence), what others said aloud.
No scripted outcomes. If the model call fails: emit `error` with retryable=true; never fake.
Sim harness `server/sim/`: 20-day seasons ×N against a local sandbox or mocked chain, report
pact formation rate, first-confession rate & day, vs a no-immunity baseline; plus 10 adversarial
contract cases. Output `server/sim/RESULTS.md` with real numbers.
Tests: vitest for event flow, zod boundaries, nonce queue, signature verification.

## Audio `audio/`
ElevenLabs (key via `~/.claude/vault/inject.sh`): design 5 buyer voices + 1 narrator (radio
dispatcher), save `audio/voices.json` {id: voice_id}. Generate: score (noir harbour jazz-ambient,
loopable 90s; tense variant; confession sting; victory cue), SFX (rain loop, gavel, wax seal,
paper slide, coins/chains slash, bell, lantern buzz, card flip, refusal thud, UI tick).
Pre-voiced barks from `audio/lines.md` (Opus writes). Output mp3/ogg in `web/public/audio/` +
`audio/manifest.json`. Loudness-normalise (-16 LUFS dialogue, -20 music).

## Definition of done
Live on a Cloudflare Pages preview + testnet contract; a stranger completes a season in ~5 min;
every error code reachable in tests; Case File shows verified NEAR AI receipts and tx links.
