# Truth ledger — Lowball demo film (take 2, season 49)

Every claim the film makes on screen or in narration, with its evidence and how it was checked (14 Nov 2026, IST).

| Claim | Evidence | Checked by |
|---|---|---|
| Five AI buyers bid and talk in character | take-2.events.json lines; 26 NEAR AI receipts | case file "Model receipts verified 26/26" |
| Buyers run on NEAR AI Cloud inside a TEE; TDX ✓ GPU ✓ signatures ✓ | `server/evidence/attestation-qwen-qwen3.6-35b-a3b-fp8-2026-11-14.json` | `npm run verify-attestation -- --live` 17:57 IST: gateway + model PASS, TCB UpToDate, GPU evidence required, live receipt signatureValid |
| Interrogation answer is an attested receipt | chat `d24476bad97d487eb2d67245747bd7b5`, verified true | take-2.casefile.json receipts |
| Release → answer 3.0 s | recording a 66.0 → a 69.0 | frame inspection |
| Your voice is transcribed by Scribe v3 | `/api/session/:id/interrogate` with audio; question text in event seq 30 | event log. The voice is an actor recording fed to the mic (disclosed in takes.md) |
| Season 49 written; five 0.05 Ⓝ bonds | `xAn5Bq8N…3qSxW`, `2JHdbadF…gmCtD` | testnet RPC: FINAL SuccessValue |
| Catch is a NEP-245 token `s49-d1`, 275 kg | `39eYF6CD…VsaJC` with mt_mint log | testnet RPC: FINAL SuccessValue, 1 event log |
| Board price from real NOAA price: bluefin $4.8078/lb (2024) | `server/src/generated/prices.json`, NOAA FOSS | day_opened.market in event log |
| Live wave height off New Bedford 0.38 m at 11:45 UTC sets the haul | sea event (Open-Meteo Marine); `catchMultiplier(waveM)` | event log; server/src/features/sea.ts |
| Day 1: five identical bids of 60 | bids_revealed seq 19 | event log |
| Day 2: matching bids make a case (4 of 5 at 60) | bids_revealed seq 36; `CASE_DAYS = 2`, `isEvidence` ≥4 of 5 below fair value | event log; server/src/game/prompts.ts |
| You sign leniency in your browser; window closes after 200 blocks | `8qt7a4o2…PaabeA` signed by `pbhl3o6…` function-call key; deadline 277653593 | testnet RPC: FINAL SuccessValue, yield log |
| Sully talks first and walks free | confess `5Rgodoqx…xRn39` | testnet RPC: FINAL SuccessValue, 2 event logs |
| Late confessions refused | Deacon `r8WxNQYo…bM19h`, Odile `4T3babAv…eProT` | testnet RPC: Failure `E_ALREADY_CONFESSED` ×2 |
| Four bonds slashed and paid to you: 0.20 Ⓝ | slashed event seq 59; verdict card | event log |
| Every pact signature re-checked in your own browser | case file pact tab, 5 × "ed25519 ✓ re-checked in your browser" | frame c 16 s |
| Forged confessions refused on-chain | `BAJJL9Sy…` E_BAD_CONFESSION_SIG, `6hnFTcuw…` E_SEASON_MISMATCH, `FTUSPdmv…` E_CLOSED | testnet RPC: Failure with those codes |
| Wiretap: "Cap at sixty. Sign it or starve." | `/api/session/547e3fe3…/wiretap` 3.9–7.7 s (ElevenLabs Text to Dialogue of the private channel) | Scribe transcript of the file |
| Chain signatures can pay out on Ethereum | Sepolia `0x92fbe20e…610c` from MPC-derived 0x1CE8…9024 | Sepolia RPC: status 0x1. It is an MPC-signed transfer from an earlier season (to the same address), shown as such |
| OutLayer enclave mode | season 32 confess `2Ad3j5Xk6kRE1qCMTF3rU8qSGSUW7P54fBnyvuxzaBuu` | research/outlayer-integration.md. **Not live in this take** (standard mode; pool down since ~10:49Z). e07b not used; the card says so |
| Players get "stuck selling low and buying high" | us.forums.blizzard.com/en/wow/t/the-auction-house-is-a-parasitic-monopolistic-force-on-the-game/2159893 (2025-08-29) | research/evidence.ndjson |
| Reading AI agents' reasoning won't catch collusion | arXiv 2609.18346 "Faithful yet Collusive: Why Chain-of-Thought Monitoring Cannot Detect Collusion in LLM Pricing Agents" | research/evidence.ndjson |
| Without leniency the ring held (96% identical); with it a buyer cracked in 9 of 10 seasons | `server/sim/RESULTS.md` (real NEAR AI calls, mocked chain) | the ledger scene shows the caveat |

Not claimed: enclave mode in this take; a Sepolia payout in this take; that the fisher's voice is a live human.
