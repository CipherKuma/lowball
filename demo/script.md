# Lowball — demo film script (draft v1, target 2:12; X limit 2:20)

Voice: the in-game narrator (harbour radio dispatcher, ElevenLabs `narrator`). Music: `harbour_loop`
→ `harbour_tense` at leniency → `confession_sting` → `victory`. Every claim maps to the truth
ledger (`demo/truth-ledger.md`, filled from the live run).

| t | Picture (all gameplay is real screen recording of the live testnet build) | Narration |
|---|---|---|
| 0:00–0:07 | Black, rain. Five sealed envelopes flip to the same number. Hold on the red glow. | "Five buyers. Five sealed bids. The same number. Every single morning." |
| 0:07–0:19 | Forum quote card: *"stuck selling low and buying high"* (Blizzard forums, 2025). Then: *2026 research: you can't catch colluding AI agents by reading their reasoning.* | "Every game economy has its cartels. Now the traders are AI agents, and researchers have shown you can't catch them colluding just by reading their thoughts." |
| 0:19–0:27 | Title screen, rain, LOWBALL. | "Lowball is a noir auction game on NEAR. You don't out-haggle the cartel. You break it." |
| 0:27–0:48 | Before dawn: bonds land on-chain one by one; "voices behind the warehouse door". Day 1: catch minted as a token; envelopes seal. | "Each buyer locks a bond in a NEAR contract, then signs a secret pact with their own key. Your catch is minted as a token and the bids are sealed." |
| 0:48–1:02 | Bids flip: identical. Ledger: taken from you. Hold the catch: Marlow and Odile answer aloud (their real voices). | "They always agree. Hold your catch and they just wait you out." |
| 1:02–1:12 | Offer leniency: you sign; red panel; live block countdown. | "So you offer leniency. The window lives on-chain and closes by itself in two hundred blocks." |
| 1:12–1:34 | Deliberation pulses. Sully cracks: IMMUNE. Ines grabs for it: REFUSED · E_ALREADY_CONFESSED. Marlow, Odile, Deacon: SLASHED. "Judas." | "The first buyer to hand over the signed pact walks free. The contract checks every signature, slashes the rest… and refuses anyone who comes second." |
| 1:34–1:42 | Verdict: paid to you, from their bonds. | "Their bonds are paid to you." |
| 1:42–2:03 | Proof montage: case file pact (ed25519 ✓ on-chain) · back-room transcript with "NEAR AI receipt verified" · nearblocks: confess tx + CATCH token transfer · yield window · Sepolia Etherscan payout. | "Every buyer thinks inside a TEE on NEAR AI Cloud, and every answer is signed and verified. The leniency clock is NEAR yield and resume. The fish are NEP-245 tokens. And through chain signatures, the cartel can even pay you on Ethereum." |
| 2:03–2:12 | Key art. LOWBALL — *make one talk.* github.com/CipherKuma/lowball · play URL. | "Lowball. Make one talk." |

Open questions for the truth ledger (fill from the live run before recording):
- Did a real AI buyer confess on the first leniency offer, and on which day? (Do not stage it.)
- Real latency of a deliberation round; cut dead time in the edit, never fake order of events.
- Sepolia payout hash from a real season with `payout_evm`.
