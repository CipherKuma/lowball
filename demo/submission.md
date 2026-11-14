# Submission draft (for Gabriel — he fills declarations and presses Submit)

Agents leave every declaration empty. Gabriel fills the rows marked _Gabriel_ and presses Submit.
Filing limit for this event: at most 2 projects per person across all personas; list every filed project before Submit.

| Field | Value |
|---|---|
| Project name | Lowball |
| Team lead | _Gabriel fills_ |
| Email | _Gabriel fills_ |
| Team size | _Gabriel fills_ |
| Tracks | Games With Real Economies; Privacy & Private AI; Agent Economy |
| NEAR wallet address | _Gabriel fills_ (CipherKuma's funded implicit account, if he chooses it: `64ddc8dc1205c677468dcb9b9ab1ea429d933046eafd9c035c672a204c19d472`) |
| Repository link | https://github.com/CipherKuma/lowball |
| Demo video | `demo/out/lowball-demo.mp4` (2:15, 1080p, −14 LUFS) → Gabriel's X post link |
| Website | https://play.lowball-game.pages.dev |

## What did you build? (about 1,920 characters; limit 2,000)

Lowball is a noir auction game where five AI fish buyers rig your sale, and you break their cartel the way antitrust regulators do: with leniency.

You sign in with your own wallet through NEAR Connect (Meteor, Intear, Nightly, Ledger, or MetaMask via Ethereum Wallets), with a NEP-413 message the server checks once and never accepts again. Each morning you land a catch at Pier Nine. Its board price is the real 2024 NOAA ex-vessel price for that species, and the live wave height off New Bedford sets the haul. The buyers seal their bids, and the bids keep coming back identical: before the season each signed a pact with its own ed25519 key. Once a day you can lean on one buyer out loud: ElevenLabs Scribe transcribes you and the buyer answers in its own voice. With two matching days on the record, you sign an offer of leniency in your wallet. The first buyer to hand our NEAR contract the signed pact walks free; the contract verifies every signature, slashes the other bonds and pays your account, and refuses every later confession.

The buyers are LLM agents on NEAR AI Cloud's Confidential TEE (Qwen3.6). Every response signature is verified against a signer proven by a live Intel TDX quote and NVIDIA GPU evidence. The leniency window is a NEP-519 yield that closes itself after 200 blocks; every catch is a NEP-245 token in escrow; Chain Signatures can pay slashed bonds to your own Ethereum address on Sepolia. Judges without a wallet can play a clearly labelled no-wallet demo. In enclave mode, each buyer's pact key lives in its own OutLayer TDX enclave (live in season 32; testnet seasons fall back to standard mode when OutLayer's pool is down, and the game says so).

Measured: 87 contract tests; 348 server tests; 18 of 18 attacks refused on the deployed contract. In simulation with real AI buyers, the ring held identical bids on 96% of days without leniency; with it, a buyer cracked in 9 of 10 seasons.

## Notes for the form (not part of the text above)

- The film's season (64) was played by the team's recording wallet, cipherkuma.testnet, in Meteor through NEAR Connect: real sign-in and a real wallet-signed `offer_leniency` (`58XrpDpt…`), on a local build of the deployed commit pointed at the live API and contract.
- The demo's back-room question is an actor's voice (ElevenLabs) fed to the microphone, because the recording browser had no microphone. Everything after it is the live game. Disclosed in `demo/footage/takes.md`.
- Season 64 ran in standard mode; enclave mode is shown as season 32's evidence, not claimed for the take.
- Every on-screen claim and its evidence: `demo/truth-ledger.md`.
