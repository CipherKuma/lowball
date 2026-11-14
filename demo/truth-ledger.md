# Truth ledger — Lowball demo film (take 10, season 64, wallet-first)

Every claim the film makes on screen or in narration, with its evidence and how it was checked (15 Nov 2026, IST).
Take 10 was played by **cipherkuma.testnet** through the **Meteor** web wallet (NEAR Connect) on a local production build of
commit `ce51dc2` (`http://127.0.0.1:4399`) pointed at the live API and the live testnet contract. Beat times:
`demo/footage/take-10.log`; full events and case file: `demo/footage/take-10.events.json`, `take-10.casefile.json`.

| Claim | Evidence | Checked by |
|---|---|---|
| You sign in with your own NEAR wallet | Meteor "Sign Message · Sign in to Lowball" for cipherkuma.testnet (take-10-m1); server issued a session for `cipherkuma.testnet` | NEP-413 verify route (`server/src/auth/`, 348 server tests incl. replay/expiry/tamper); session account read back in the browser |
| Five AI buyers bid and talk in character | take-10.events.json lines; 26 NEAR AI receipts | case file "AI receipts verified 26/26" |
| Buyers run on NEAR AI Cloud inside a TEE; TDX ✓ GPU ✓ signatures ✓ | `server/evidence/attestation-qwen-qwen3.6-35b-a3b-fp8-2026-11-14.json` | `npm run verify-attestation -- --live` 14 Nov 17:57 IST: gateway + model PASS, TCB UpToDate, GPU evidence required |
| Interrogation answer is an attested receipt | chat `a47f963d036a…` (interrogation seq 29) | take-10.casefile.json receipts |
| Your voice is transcribed by Scribe v3 | `/api/session/:id/interrogate` with audio; question in event seq 29 | event log. The voice is an actor recording fed to the mic (disclosed in takes.md) |
| Season 64 written; five 0.05 Ⓝ bonds | create_season `Da9VdLxJ…nYQ2S`, post_bond `Ev4CXwZK…LSWaJ` | testnet RPC (drpc): FINAL SuccessValue |
| Catch is a NEP-245 token `s64-d1`, 926 kg | open_lot `CfgZBR3h…RZ54h` with mt_mint log | testnet RPC: FINAL SuccessValue, 1 event log |
| Board price from the real NOAA price: monkfish $0.6811/lb (2024) | `server/src/generated/prices.json`, NOAA FOSS | day_opened.market in the event log |
| Live wave height off New Bedford 0.32 m at 19:15 UTC sets the haul | sea event (Open-Meteo Marine) | event log; server/src/features/sea.ts |
| The sealed bids come back identical (60) | bids_revealed day 1 and day 2, all five at 60 | event log |
| You offer leniency, signed in your own wallet; window closes after 200 blocks | offer_leniency `58XrpDpt7WNFrxL7qwygCfAvVhKF6TsE1xS2NQBT5Vjj`, signer **cipherkuma.testnet** (Meteor "Approve Transaction", take-10-m2); deadline block 277700552 | testnet RPC: FINAL SuccessValue; NearBlocks account history |
| Sully talks first and walks free | confess `DZgEwTipRDmoY1tYYXWvrjJXLFyYoxixgJCpF9xL3sdv` | testnet RPC: FINAL SuccessValue; `get_season(64).first_confessor = sully` |
| Late confessions are refused | Ines `6AoE5NLZ…VAZczF`, Odile `6NRHxeqc…wnkKJ` | testnet RPC: Failure `E_ALREADY_CONFESSED` ×2 |
| Four bonds slashed and paid to your wallet: 0.20 Ⓝ | `get_season(64)`: player `cipherkuma.testnet`, slashed_total = player_payout = 0.2 NEAR, payout_route near; transfer lowball-ck → cipherkuma.testnet in tx `DZgEwTip…` | testnet RPC view call; NearBlocks |
| Every pact signature re-checked in your own browser | case file pact tab, 5 × VERIFIED | frame take-10-c 25–29 s |
| Forged confessions refused on-chain | `3WRoQZqv…` E_BAD_CONFESSION_SIG, `2PSVbMss…` E_SEASON_MISMATCH, `87jRNLbw…` E_CLOSED | testnet RPC: Failure with those codes |
| Wiretap: "Cap at 60. Sign with me." | `/api/session/7d314f91…/wiretap` (ElevenLabs Text to Dialogue of the private channel) | local Whisper transcript of the file, 4.2–6.5 s |
| Chain Signatures can pay out on Ethereum | Sepolia `0x92fbe20e…610c` from MPC-derived 0x1CE8…9024 | Sepolia RPC: status 0x1. An MPC-signed transfer from an earlier season, shown as such |
| OutLayer enclave mode | season 32 confess `2Ad3j5Xk6kRE1qCMTF3rU8qSGSUW7P54fBnyvuxzaBuu` | research/outlayer-integration.md. **Not live in this take** (standard mode) |
| Players get "stuck selling low and buying high" | us.forums.blizzard.com/en/wow/t/the-auction-house-is-a-parasitic-monopolistic-force-on-the-game/2159893 (2025-08-29) | research/evidence.ndjson |
| Reading AI agents' reasoning won't catch collusion | arXiv 2609.18346 | research/evidence.ndjson |
| Without leniency the ring held (96% identical); with it a buyer cracked in 9 of 10 seasons | `server/sim/RESULTS.md` (real NEAR AI calls, mocked chain) | the ledger scene shows the caveat |

Not claimed: enclave mode in this take; a Sepolia payout in this take; that the fisher's voice is a live human; that the
recording browser was a stranger's (it is the team's recording wallet, approved by Gabriel for testnet recording).
Continuity: from Connect to the case file the season plays in order with no skipped stage. Three stretches are shown faster
than real time and labelled on screen (the season being written ×7, next day → Sully's poster ×7, back to the table →
the day-2 sale ×4); the Meteor screens are zoomed crops of the real wallet tab (take-10-m1, take-10-m2), shown in real time.
