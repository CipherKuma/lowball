# Lowball demo film: production brief (Opus direction → Astra execution)

Deliverable: `demo/out/lowball-demo.mp4`, 1920×1080, 30 fps, H.264 + AAC, **≤ 2:15** (X upload limit
2:20), loudness −14 LUFS integrated, true peak ≤ −1 dBTP. Also `demo/out/review-master/` (uncut).
Follow `~/Documents/hackathons/_buildroom/DEMO_RECORDING_STANDARD.md` four layers: untouched source →
uncut review master → edited selects → final. Never cut in a way that changes causal order.
Shared Remotion studio: `~/Documents/hackathons/_demo-videos` (read its README first). Put this
film's composition under a new folder there named `lowball/`; copy assets in, don't symlink repo files.

## Truth rules (non-negotiable)
- Every gameplay frame is a REAL recording of https://play.lowball-game.pages.dev on NEAR testnet.
  No preview mode (`?preview=1`) footage anywhere. No mocked UI, no re-ordered events.
- Narration files are in `demo/vo/` (`e01`…`e10`; `e07b` only if `demo/truth-ledger.md` says OutLayer
  TEE keys are live). Text in `demo/narration.json`. Do not edit narration text.
- Numbers on screen only from `server/sim/RESULTS.md`, `contract/TEST-RESULTS.md`,
  `server/sim/ADVERSARIAL-REAL.md` (quote them exactly).
- If a take shows something different from the script (e.g. nobody confesses), keep the take honest
  and pick another take; never fake an outcome.

## Capture
- agent-browser, own session, viewport 1920×1080, headed rendering not required; `record start
  demo/footage/raw/take-<n>.webm https://play.lowball-game.pages.dev/`. Sound cannot be captured;
  the game's audio is rebuilt in the edit from `web/public/audio/` (same files the game plays).
- Click path per take: Title → "Take your catch to market" → wait for day 1 lot → "Open the bids &
  sell" → wait for reveal + settle → "Next day" → "Open the bids & sell" → … until the ledger's
  leniency button reads "first to confess walks free" (case built; usually after 2 sells) → "Offer
  leniency" → wait for confession or holdout → if season not closed: continue → "Open the case
  file" → click each tab ("The pact", "The back room", "On-chain record") 4 s each.
- Natural cursor: move to targets over ~400 ms with easing, hover 300 ms before clicks.
- Record 3 full takes (each a fresh season). Write `demo/footage/takes.md`: per take, wall-clock of
  each state change (day opened, reveal, leniency open, each confession_attempt, slashed, closed),
  which buyer confessed, whether a second confession was refused, tx hashes (from the on-chain
  receipts drawer). Prefer the take where a SECOND confession was refused on screen.
- Also capture still proof shots (1920×1080 screenshots), each from the chosen take's real hashes:
  nearblocks confess tx (shows `confess` + slash), nearblocks NEP-245 `mt_transfer` event, nearblocks
  `offer_leniency` yield, Sepolia Etherscan payout (from `contracts/payout-desk` real tx
  `0x92fbe20ea23866a2bec120eb8864da5205918b690f594f71c662c4c9c999610c` if the chosen take has none),
  OutLayer attestation page (only if truth ledger says live).

## Edit (timeline, ≈2:12)
| t | Picture | Sound |
|---|---|---|
| 0:00–0:14 | Cold open on the take's identical-bid reveal (envelopes flip, red glow), slow push-in. Then title card over `web/public/art/keyart.webp`: LOWBALL, Fraunces 850 italic, #f3e7cf, amber glow. | e01 over rain bed (`sfx/rain_loop`), card flip + `vo/identical.mp3` (in-game narrator) under the reveal |
| 0:14–0:20 | Title screen from the take (real). | e02; music `harbour_loop` in |
| 0:20–0:44 | Before dawn → bonds land → day 1 lot with CATCH token chip. Speed setup waits ×4 max, label "sped up ×4" bottom-left (Inter Tight 18px, 60% white). | e03 |
| 0:44–1:00 | Day 1–2 reveals: identical bids, ledger "taken from you" climbs, a buyer line bubble (use that line's TTS: fetch `https://play.lowball-game.pages.dev/api/tts?session=<id>&seq=<n>` for the take's `line` events; it is cached). | e04, `gavel`, `card_flip` |
| 1:00–1:12 | Offer leniency: red panel + live block countdown. | e05; music crossfades to `harbour_tense` |
| 1:12–1:38 | Deliberation → IMMUNE / REFUSED / SLASHED stamps (hold 2 s on the stamps) → verdict payout. | e06 (lands after the stamps), `confession_sting`, `wax_seal`, `refusal_thud`, `bond_slash`, `coins_pour`; buyers' real TTS lines ("Judas.") |
| 1:38–2:00 | Proof: case file tabs (pact ed25519 ✓, back-room receipts verified) then explorer stills with a slow Ken Burns and a single amber underline drawing under the key field. | e07 (+ e07b if live), e08 |
| 2:00–2:06 | Ledger/payout recap or sim table as a designed stat row: "96% identical bids without leniency · cracked in 9 of 10 seasons with it". | e09 |
| 2:06–2:12 | Key art, LOWBALL, "github.com/CipherKuma/lowball · play.lowball-game.pages.dev". | e10, `victory` tail |

Motion: continuous — push-ins and match cuts between game states, no entrance-then-hold cards, no
repeated whooshes (use only the game's own SFX). Captions: burn in narration captions, Inter Tight
30px, bottom-centre, max 2 lines, phrase-level timing from the VO files.

## Disk
Run `~/.agents/bin/disk-check` before recording and before each render; if it exits 1, free your own
space first. Once a take or render is reviewed and no longer the working cut, move it to Dropbox with
`~/.agents/bin/media-offload <file>` (verifies, then deletes locally) and note the Dropbox path in
`demo/footage/takes.md`. Keep only the working cut and the final locally.

## Handback
`demo/remotion-plan.md` (composition name, Studio URL, asset list with provenance), `demo/out/`
renders, `demo/footage/takes.md`, encode validation (ffprobe duration/codec/loudness numbers).
