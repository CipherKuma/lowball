# Lowball

![Five buyers around the auction table](web/public/art/keyart.webp)

**Five AI fish buyers are rigging your auction. Build a case, offer leniency, and make one of them talk.**

Every morning you land a catch at Pier Nine. Five buyers seal their bids, and the number keeps coming
back the same, and low. Before the season they signed a secret pact. You can't out-haggle a cartel, so
you do what real antitrust regulators do (it is modelled on the US DOJ Antitrust Division's
[Leniency Policy](https://www.justice.gov/atr/leniency-policy)): take their price until identical bids
are on the record, lean on a buyer in the back room, then offer **leniency**. The first buyer to hand
the signed pact to our NEAR contract walks free. Every other signer loses their bond to you. A second
confession, a forged one, or a replayed one is refused on-chain.

- **Play:** https://play.lowball-game.pages.dev (NEAR testnet, no wallet needed) · **Demo video:** _X post linked at submission_
- **Contract:** [`lowball-ck.testnet`](https://testnet.nearblocks.io/address/lowball-ck.testnet) · **Payout desk:** [`desk.lowball-ck.testnet`](https://testnet.nearblocks.io/address/desk.lowball-ck.testnet)
- **Tracks:** Games With Real Economies · Privacy & Private AI · Agent Economy

## A season

1. **Before dawn.** Your fisher account opens on NEAR testnet with a key generated in your browser. The
   five buyers lock bonds in the contract and talk in private; each decides whether to sign the pact
   (`every member bids exactly N marks`) with its own ed25519 key. You only hear that talk at the end.
2. **The market.** Each day's catch is minted as a NEP-245 `CATCH` token in escrow. Its board price is
   the **real 2024 US ex-vessel price** for that species from NOAA Fisheries; the **live swell** off
   New Bedford (Open-Meteo Marine) sets how much the boat brings in. Buyers commit sealed bids
   (sha256 commit-reveal), reveal, and the token moves to the winner on-chain.
3. **The back room.** Once a day you can corner one buyer and **speak** to them. Your voice is
   transcribed by ElevenLabs Scribe v3, the buyer answers through the same TEE model, in their own
   ElevenLabs v4 voice. What you said, and how they took it, stays with them.
4. **Leniency.** With two days of identical bids on the record, you sign `offer_leniency` yourself.
   The contract opens a **NEP-519 yield** that closes by itself after 200 blocks. The buyers deliberate
   on real numbers: their bond, their share of the ring's pool, the evidence, what you said to them.
   Whoever confesses first gets immunity; the contract verifies every pact signature and the
   confessor's own signed confession, slashes the others and pays you.
5. **The case file.** The pact and every signature (re-check them in your browser), the cartel's
   private talk as a recovered **wiretap** (ElevenLabs Text to Dialogue), every NEAR AI receipt with
   its attestation result, every transaction, and **Try to cheat**: real forged, replayed and late
   confessions the contract refuses in front of you.

## What each piece does

| Piece | Its job in the game | Where |
|---|---|---|
| **Own NEAR contract** (Rust, near-sdk 5) | Bonds, sealed auction, pact verification, first-confessor immunity, slashing, payouts; 40+ stable error codes | `contract/` |
| `env::ed25519_verify` | Pact and confession signatures must verify before any bond moves; forged, replayed, non-member or second confessions are refused | `contract/src/pact.rs`, `confess.rs` |
| **NEP-519 yield / resume** | The leniency window: a confession resumes it, silence times it out after 200 blocks with no server involved | `contract/src/leniency.rs` |
| **NEP-245** | Every catch is a `CATCH` token (`s{season}-d{day}`, amount = kg), escrowed then transferred to the winning buyer | `contract/src/mt.rs` |
| **Chain Signatures** | Optional: slashed bonds pay out in Sepolia ETH from an address NEAR's MPC network derives and signs for | `contracts/payout-desk/` |
| **NEAR AI Cloud** | Every buyer decision runs on Qwen3.6-35B in NEAR AI's own-fleet **Confidential TEE**; each response signature is checked against a signer proven by a live Intel TDX quote + NVIDIA GPU attestation | `server/src/llm/`, `server/evidence/` |
| **OutLayer** (Intel TDX) | **Enclave mode:** each buyer's pact key is derived inside its own enclave binary; the pact signature and the confession signature are made there, and the attestation verifies (first accepted enclave confession: season 32, `research/outlayer-integration.md`). Each season picks enclave or standard mode from OutLayer's live health, records it on-chain through the contract's key snapshot, and shows it in the top bar | `outlayer/`, `server/src/tee/` |
| **Function-call keys** | Your browser key can call only `offer_leniency` on this contract | `web/src/lib/wallet.ts` |
| **ElevenLabs** | v4 voices for every buyer and the narrator, v4 Turbo for live lines, Scribe v3 (keyterms) for your interrogation, Text to Dialogue for the wiretap, SFX v3, Music v2.5 | `audio/`, `server/src/tts.ts`, `server/src/features/` |
| **NOAA Fisheries FOSS** | Real ex-vessel $/lb sets each lot's board price | `server/src/features/noaa.ts`, `server/src/generated/prices.json` |
| **Open-Meteo Marine** | Live wave height at New Bedford scales the catch | `server/src/features/` |

## Does it hold up? (measured)

- **Contract:** 87 tests (unit + near-workspaces sandbox, including a real confession race) — `contract/TEST-RESULTS.md`.
- **On the deployed contract:** 18 of 18 adversarial refusals as expected — `server/sim/ADVERSARIAL-REAL.md`; the forgery drill's real refused transactions — `server/FEATURES-RUN.md`.
- **Server:** 308 tests — `server/TEST-RESULTS.md`.
- **Live on the deployed game (14 Nov, season 46):** a buyer confessed, four bonds were slashed and paid to the player, a second
  confession was refused, all five pact signatures re-checked in the browser, and the forgery drill's three attacks were refused.
- **Behaviour (simulation, real NEAR AI buyers on a rule-faithful mock chain):** without leniency the ring
  held identical bids on 96% of days and took 153 marks per lot from the fisher; with leniency a buyer
  cracked in 9 of 10 seasons (day 3.6 on average) and the loss fell to 92 marks per lot — `server/sim/RESULTS.md`.
- **TEE evidence:** `cd server && npm run verify-attestation` re-checks NEAR AI's attestation live (no key needed).

## Run it

- **Play:** https://play.lowball-game.pages.dev
- **UI with no funds or keys:** `cd web && pnpm install && pnpm dev`, open `http://127.0.0.1:5199/?preview=1` (a scripted season, badged as not on-chain).
- **Full stack on testnet:** `server/README.md` (contract deploy, buyer accounts, Worker secrets).

## Honest limits

- Our Worker relays buyer transactions and builds the prompts each buyer sees, so it could try to steer a
  buyer. In enclave mode it cannot forge a buyer's pact or confession signature; every NEAR AI response it
  uses is signed either way.
- OutLayer's testnet executor pool is unreliable (job latency from 15 s to over two minutes on 14 Nov). When it
  is unhealthy, a season runs in **standard mode**: the buyers' keys are server-held for that season, the
  game says so, and the contract's key snapshot records it.
- Attestation checks the TDX quote, GPU evidence and signer binding; NEAR AI publishes no measurement
  allowlist, so measurements are recorded, not matched. OutLayer's own governance can, per its docs,
  access the shared master secret outside an enclave.
- Simulation numbers come from a mock chain that enforces the contract's rules; live seasons are on testnet.
- Testnet only: bonds and payouts are testnet NEAR and Sepolia ETH.

## License

MIT
