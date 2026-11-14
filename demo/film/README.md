# Lowball film assembly

Opus direction: `../film-direction.md`. Rule zero: this film uses Lowball's painted world,
palette and typography. Teaching projects informed construction only; no reference media is copied.

Studio: **http://localhost:3060/Lowball**. Composition: **Lowball**, 1920×1080, 30 fps,
4,050 frames / **2:15**. Remotion and its packages are pinned to **4.0.529**.

## Run

```sh
cd demo/film
npm install
npm run dev
npm run typecheck
npm run check
npm run stills -- 90 330 420 540 680 770 1010 1380 1450 1500 2260 2370 2820 3060 3450 3620 3710 3900
```

`dev` starts `npx remotion studio --port 3060 --no-open` with a scoped polling shim.
This host rejects even one native `fs.watch` with EMFILE. The shim replaces watching only in
that Studio process; it does not change system settings or dependencies. Standard hosts can
run `npx remotion studio --port 3060` directly. Studio is the only owned process left running.

The stills script runs `~/.agents/bin/disk-check` before **each** `npx remotion still` call.
It selects the downloaded Chrome Headless Shell in `.cache/` when present, or Remotion's
normal browser otherwise. `REMOTION_BROWSER_EXECUTABLE` overrides that selection.

**Visual continuation review rendered successfully.** Chromium launches with its temporary
files scoped to `.cache/tmp/`. `review/sheet.jpg` contains 18 timeline stills; the two
`review/boundaries-*.jpg` sheets show all ten scene transitions at −1, 0, +9 and +18 frames.
Individual full-resolution frames are in `review/fNNNNN.png`. See `review/continuation.md`
for the actual checks and remaining limits. These are still reviews, not full audiovisual approval.

To reproduce the review, use `TMPDIR="$PWD/.cache/tmp" node scripts/render-review.mjs <frames>`
(bundle once, reuse Chromium), then `python3 scripts/contact-sheet.py` once the listed frames exist.

## Fill the take

Every factual display value and media slot lives in **`src/data/take.ts`**.
The current values are simulation results from `server/sim/RESULTS.md` and all six NOAA
entries from `server/src/generated/prices.json`. The chart's Atlantic cod value is explicitly
a **reference preview**, not a claim about an unrecorded lot. The map is a schematic.

1. Copy real source selects to `public/footage/`. Keep untouched source and review masters
   in the recording workflow; do not write outside this project from the film executor.
2. In each `footage` object, add `src:'footage/name.mp4'` after `...pendingMedia`, set
   `sourceIn` in **source frames**, `provenance` to the take record, and `focus` to percent
   coordinates of the relevant UI. Videos are muted; attach the real take's audio separately.
3. Populate the recorded session, species, swell, latencies, signatures, values and receipts.
   `verifiedTransactions` is an explicit verification result, not inferred from a hash's presence.
   No preview-mode gameplay, mocked UI or reordered outcome is allowed.
4. Copy re-voiced files to `public/vo/`; add each narration object's `src` after
   `...pendingVoice`. The `source` field records the requested `demo/vo/*.mp3` name.
   Existing VO files have deliberately not been fitted or truncated to the new storyboard.
5. Add phrase-level `captionCues`: `from`/`to` are frames relative to that narration slot.
   Maximum two lines; rendered at Inter Tight 30 px. Empty slots stay silent and labelled.
6. Attach actor question, actual buyer TTS and wiretap recordings under `takeAudio`.
   Wiretap is reserved under the proof board. Do not substitute stock buyer speech.
7. Only enable OutLayer PROVEN/e07b with live attestation and truth-ledger evidence.
   NEAR AI VERIFIED needs TDX, GPU and response-signature evidence.
8. Review causal order, every handoff, audio and final encoding. Record actual measurements
   in `take.review`. `npm run check:delivery` refuses unresolved slots or missing review/mix.

`audio:false` mutes the composition. `showGuide:false` hides VO-slot labels only; it does
**not** hide footage placeholders, TODO evidence or source qualifications.

## Timeline / gameplay slots

Times are film-relative; each end is exclusive. No footage exists yet.

| Slot | Timeline | Duration | Expected content |
|---|---|---:|---|
| cold-open | 0:00–0:07 | 7 s | Five envelopes reveal the same number, red glow, in-game identical line |
| before-dawn | 0:27–0:42 | 15 s | Key registration, bond receipts, cartel behind the door |
| day-one-lot | 0:42–0:55 | 13 s | Lot, CATCH chip, take species/NOAA/swell; chart overlays first ~8 s |
| identical-bids | 0:55–1:08 | 13 s | Days 1–2 bids, evidence dots, shortfall, actual buyer line |
| interrogation | 1:08–1:28 | 20 s | Actor question, transcript, actual buyer response, pressure |
| leniency | 1:28–1:50 | 22 s | Browser signature, countdown, immunity/refusal/slash, payout |

Other scenes: world/title 0:07–0:15; problem board 0:15–0:27; proof board 1:50–1:59;
ledger 1:59–2:06; closing lockup 2:06–2:15. The last two proof subsequences occupy the
1:50–2:06 proof interval in the direction. Gameplay slots occupy 90 of 135 seconds,
including the chart/Telegram overlays.

## Components and motion

- `WorldTravel`: pier push → warehouse → zinc table, alpha foreground props, swinging lamp.
- `CaseBoard`: independently pinned typed cards, camera travel, sagging red strings.
- `Telegram`: character typing, paper depth, spring rubber stamp; pending unless verified.
- `Chart`: New Bedford/Fairhaven harbour schematic, swell pin, NOAA price tag, pinned left-side overlay.
- `FramedPlay`: thin brass frame, lamp falloff, frame drift and per-take UI focus push.
- `LedgerSplit`: paired ledger pages, stroke-mask number writing and red underlines.
- `Lockup`: variable Fraunces 850 italic, amber glow, three painted wax seals, play/repo URLs.
- Supporting components: `Atmosphere`, `Stamp`, `Handoffs`, `Soundtrack`, `CaptionsAndSlotGuide`.

Motion is frame-derived. No CSS animation timers. Hand-offs use a shared title card into
the board, case paper into a Telegram, Telegram into chart, board papers into ledger pages,
and the ledger seal into the closing seal treatment. These need visual review in a render-capable
session; source implementation and compilation do not establish motion quality.

## Sound and assets

All 45 copied media assets are listed with original paths and SHA-256 in `src/data/assets.json`.
No symlinks. `node scripts/sync-assets.mjs` refreshes only this project's copies from the game
and updates hashes. Music/SFX were refreshed from the current game assets during handback.
The three fonts load through `@remotion/google-fonts`; rendering needs access to Google Fonts.

Music: harbour loop 0:00–1:30, tense 1:28–1:45, confession sting 1:43–1:49,
victory 1:47–2:15, with overlaps/fades. Rain and lamp run beneath. Twenty-five timed SFX
cues use only the game's library: paper, card, folder, bell, wax, refusal, slash and coins.
Music attenuates during loaded narration/take audio and the cold-open line.

This is a **preview mix**. Gains are not LUFS measurements. Final VO −16 LUFS, master
−14 LUFS and ≤ −1 dBTP remain unmeasured; no listening claim is made.

## Checks and handoff

The continuation fixes and validation are recorded in `review/continuation.md`.
TypeScript and assembly checks pass; delivery remains pending real footage, narration,
receipts, captions, final audiovisual review and measured mix/encode.

Studio: **http://localhost:3060/Lowball**, left running via `npm run dev`.
All executor edits and review artifacts remain inside `demo/film/`.
No git operations were performed; the integrator owns committing.

Unenforced judgments: primary-source authenticity beyond supplied text, receipt attestations,
full-speed motion quality, real take causal order, and perceptual mix. A green assembly check
and inspected stills do not establish delivery approval.
