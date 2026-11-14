# Lowball film: direction (Opus) — supersedes the edit table in production-brief.md

## Rule zero
The film looks and feels like **Lowball**, not like the references. Style = the game: painted noir
art (`web/public/art/*`), sodium-amber light on teal-black, rain, film grain, Fraunces (display,
italic for voice), Inter Tight (UI), IBM Plex Mono (data). Palette tokens: `web/src/styles/tokens.css`.
The references (`~/Documents/motion-teaching-projects/round2-2026-09-28/` Grok + Pine Labs
recreations; Local Edition https://youtu.be/D3mw2Bbj5qs; Wallspace https://youtu.be/-mzQMyPcbN4)
teach **construction only**: continuous camera travel, object→next-scene transformations, words
that survive cuts, API calls shown as readable cards with real values, before/after contrast,
branching connectors from product to integrations, product UI framed with depth. Read the Pine
Labs `RETRO.md` + `DECISIONS.md` and the Grok `RETRO.md` before building motion.

## It is a game: mostly gameplay
≈70% real gameplay footage of https://play.lowball-game.pages.dev (recorded later, slots now),
≈30% motion graphics that carry the tech story quickly. No explainer slides. Never fake UI: motion
cards may restate REAL values from the recorded take (tx hashes, prices, signatures, latencies).

## Motion vocabulary (build these as reusable Remotion components)
- **WorldTravel**: parallax push through the painted world: `bg_pier_title` → `bg_auction`
  (lamp swings in) → the zinc table. Layer props (`prop_*.webp`, alpha) for depth; rain + grain on top.
- **CaseBoard**: a corkboard/dark-wood wall under the lamp; index cards pinned, **red string**
  (#b8392c, slight sag, draws on with ease-in-out) links them. Cards are typed (IBM Plex Mono) with a
  Fraunces title. This replaces Wallspace's road-branches as our integration connector.
- **Telegram**: a small typed card for an API call: `POST cloud-api.near.ai/v1/chat/completions`,
  model, `TEE ✓ signature ✓`, latency. Types on character by character; a rubber "VERIFIED" stamp
  lands (spring, slight rotation) — reuse the game's stamp style.
- **Chart**: nautical chart of New Bedford harbour (draw in SVG, sepia lines on teal) with a pin for
  the live Open-Meteo swell reading and a price tag pinned for NOAA ex-vessel $/lb of the take's lot.
- **FramedPlay**: gameplay footage inside a thin brass frame with soft lamp falloff; camera pushes
  into the UI region that matters (bids, ledger, stamps) — never full-screen static captures.
- **LedgerSplit**: two ledger pages side by side for before/after (no leniency vs leniency) with the
  sim numbers writing in by hand-feel (stroke-dash reveal).
- **Lockup**: LOWBALL (Fraunces 850 italic, #f3e7cf, amber glow) → wax seal stamps beneath it →
  `play.lowball-game.pages.dev · github.com/CipherKuma/lowball`.

## Storyboard (≤ 2:15, 1920×1080, 30 fps)
| t | Scene | Content (real values from the take where shown) |
|---|---|---|
| 0:00–0:07 | FramedPlay | Cold open: five envelopes flip to the same number; push in on the red glow. In-game VO `identical`. |
| 0:07–0:15 | WorldTravel → Lockup(in) | Pier at night → into the warehouse → LOWBALL title forms over the table. |
| 0:15–0:27 | CaseBoard | Problem: pinned forum quote card (game cartels, Blizzard forum 2025) + research card (AI agents collude; reasoning can't catch it). String pulls to a card: "Lowball: break the cartel". |
| 0:27–0:42 | FramedPlay + Telegram | Before dawn: bonds land (tx), cartel forms behind the door. Telegrams: `register_buyer_key · ed25519` and `post_bond · 0.1 Ⓝ`. |
| 0:42–0:55 | Chart → FramedPlay | Day 1 lot: chart pin "NOAA FOSS <year>: <species> $<x>/lb" + "swell <m> m, Open-Meteo, live" → the lot on the zinc with the CATCH token chip; Telegram `mt_mint s<N>-d1`. |
| 0:55–1:08 | FramedPlay | Days 1–2: identical bids, evidence dots fill, "Taken from you" climbs, a buyer's voiced line. |
| 1:08–1:28 | FramedPlay + Telegram | Interrogation by voice: the fisher speaks (actor voice), transcript appears; Telegram `ElevenLabs Scribe → Qwen3.6 (TEE) → eleven_v3`; buyer answers in his own voice; pressure pips rise. |
| 1:28–1:50 | FramedPlay + Telegram | Offer leniency (signed in-browser) → live block countdown (Telegram `promise_yield_create · 200 blocks`) → IMMUNE / REFUSED `E_ALREADY_CONFESSED` / SLASHED → payout. Telegram `confess · ed25519_verify ×N ✓`. |
| 1:50–2:06 | CaseBoard (proof) | Red string connects: NEAR AI TEE (TDX + GPU ✓), OutLayer enclave keys (PROVEN — only if live), Chain Signatures → Sepolia tx, NEP-245, yield. Wiretap audio (the cartel's real back-room talk) plays under it. LedgerSplit stats from `server/sim/RESULTS.md`. |
| 2:06–2:15 | Lockup | LOWBALL · "Make one talk." · URL + repo. |

## Sound
Music: `web/public/audio/music/harbour_loop` → `harbour_tense` (leniency) → `confession_sting` →
`victory`. SFX only from `web/public/audio/sfx/` (vary them; no whooshes). Narration: `demo/vo/`
(will be re-voiced to this storyboard; leave narration tracks as named slots). Buyer voices: the
take's real TTS lines. Mix: VO −16 LUFS, music ducked under VO, master −14 LUFS, peak ≤ −1 dBTP.

## Now vs later
Build now: every motion component + scenes 0:07–0:27, the proof CaseBoard, Lockup, with clearly
labelled placeholder slots for gameplay clips and real values. Later (after deploy, ~18:00 IST):
record takes, fill slots, final narration, mix, render.
