# Submission draft (for Gabriel — he fills declarations and presses Submit)

| Field | Value |
|---|---|
| Project name | Lowball |
| Team lead | _Gabriel fills_ |
| Email | _Gabriel fills_ |
| Team size | 1 — Solo builder (_Gabriel confirms_) |
| Tracks | Games With Real Economies; Privacy & Private AI; Agent Economy |
| NEAR wallet address | _Gabriel confirms_ (CipherKuma's funded implicit account: `64ddc8dc1205c677468dcb9b9ab1ea429d933046eafd9c035c672a204c19d472`) |
| Repository link | https://github.com/CipherKuma/lowball |
| Demo post link | _Gabriel's X post_ |
| Website | https://play.lowball-game.pages.dev |

## What did you build? (≈1,450 characters; limit 2,000)

Lowball is a noir auction game where five AI fish buyers rig your auction, and you break their cartel the way regulators do: with leniency.

Each morning you land a catch at Pier Nine. The buyers seal their bids, and the bids keep coming back identical and low. Before the season they formed a cartel in private and each signed a pact with their own ed25519 key. Every identical day goes on the record. Once you have a case, you offer leniency from your own browser key. The first buyer to hand our NEAR contract the signed pact walks free; the contract verifies every signature on-chain, slashes the other members' bonds and pays them to you, and refuses anyone who confesses second.

The buyers are LLM agents running on NEAR AI Cloud's Confidential TEE (Qwen3.6), deciding from real payoffs, and every response signature is verified against an attested signer (Intel TDX quote + NVIDIA GPU evidence). The leniency window is a NEP-519 yield that closes itself after 200 blocks. Every catch is a NEP-245 token held in escrow and transferred to the winning buyer. With chain signatures, the slashed bonds can pay out in Sepolia ETH from an MPC-derived address.

In 14 simulated seasons with real AI buyers, the ring held identical bids 96% of the time without leniency; with it, a buyer cracked in 9 of 10 seasons (day 3.6 on average) and the fisher's loss per lot fell from 153 to 92 marks. 87 contract tests and 18/18 adversarial refusals pass on testnet.

> Numbers above must match `server/sim/RESULTS.md`, `contract/TEST-RESULTS.md` and `server/sim/ADVERSARIAL-REAL.md` at submission time; update if re-run. Add the OutLayer sentence only if the TEE-key integration ships and is verified.
