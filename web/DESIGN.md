# Lowball UI — direction A, "Under the lamp"

Approved by the team, 14 Nov 2026 21:50 IST. References: Papers, Please (documents on a desk), Cultist Simulator
(cards on a table), Genesis Noir teaser (posters pinned to a wall), and for the back room only, Detective Box /
Cuchillo Midnight (camera framing, tape-deck readouts). The painted art in `public/art` stays; it is good.

## The idea
The player sits at a wet auction desk on Pier Nine at 4 a.m. under one lamp. Every piece of interface is a
physical object on that desk or pinned to the wall behind it: wanted posters (buyers), a chalk slate (the lot),
kraft envelopes (sealed bids), a ruled ledger page (your money), telegrams (dispatch, buyer lines), a manila
folder (case file), rubber stamps (verdicts), brass plaques (primary actions). Nothing floats in a generic card.

## Tokens and materials (use these, don't invent)
- `src/styles/tokens.css`: palette (night/wood, lamp, papers, slate/chalk, stamp inks, harbour), type roles, motion, shadows, textures.
- `src/styles/materials.css` + `src/styles/objects.css`: `.desk .lamp-pool .paper(--aged|--telegram|--manila|--kraft|--ruled) .pin .tape-strip .tilt
  .sign .stencil .typed .spoken .data .label .plaque(--stamp) .plaque-note .ticket .typed-link .stamp(--verified|--carbon|--on-dark)
  .slate .chalk .envelope .poster .telegram-strip .camera .rec-dot`.
- `src/components/ui/`: `<MaterialDefs/>` (rendered once by App), `<Stamp/>` (animated slam), `<Envelope/>`, `<Poster/>`.

## Type roles
| Role | Token | Use |
|---|---|---|
| Signage | `--font-sign` Big Shoulders Display 800–900, uppercase | headings, buyer names, buttons, numbers that matter |
| Stencil | `--font-stencil` | crate/lot labels, DAY markers, PIER NINE |
| Typed | `--font-typed` Special Elite | documents, telegrams, stamps, helper notes on paper |
| Spoken | `--font-spoken` IM Fell English (+ italic) | anything a person says: buyer lines, answers, quotes |
| UI | `--font-ui` Libre Franklin | plain help text and body copy on the dark |
| Data | `--font-data` Courier Prime | hashes, account ids, NEAR amounts, block counts |
Never use Fraunces/Inter/Plex again. Sizes: one scale per screen; body ≥ 15px; typed notes ≥ 12px.

## Controls (hierarchy is the point)
- **Primary** = `.plaque` (lamp-lit brass). One per screen state. Stamp variant `.plaque--stamp` only for leniency.
- **Secondary** = `.ticket` (paper stub). **Tertiary** = `.typed-link`.
- A disabled control ALWAYS shows why, in a `.plaque-note` line under it ("build your case first · 1 of 2 evidence days").
- Everything clickable looks clickable: hover lift, pressed state, visible focus ring (`--lamp-hot`).
- Keep these accessible names exactly (tests and the film recorder use them): `Open the bids & sell`, `Hold the catch`,
  `Next day`, `Close the season`, `Offer leniency`, `Lean on <Full Name>`, `Back to the table`, `Leave the back room`,
  `Open the case file`, `Re-check every signature in your browser`, `Play the wiretap`, `Try to cheat`, `Play another season`,
  `Try again`, `Start speaking` / `Stop and send` (mic), `Say it`.

## Motion (one orchestrated moment per screen; ease-out; 150–450 ms; respect reduced motion)
- Papers land on the desk: drop from y −12px + rotate settle, `--ease-drop`, staggered 60–90 ms.
- Envelopes: slide in face down, then slit open together on reveal (flap lifts, card rises), identical numbers get a red chalk ring.
- Stamps slam (scale 1.7 → 1). Telegram text types on (steps), max 1.2 s.
- No bouncing UI chrome, no parallax gimmicks, no glow pulses on everything. The lamp flicker is the only ambient loop.

## Copy voice
Terse, period, plain verbs. Buyers speak in IM Fell; the system speaks typed. Every number has its unit (Ⓝ, kg, m, blocks).
No emoji, no exclamation marks in system copy, no "Web3" jargon in player copy: say "your NEAR account", "signed on NEAR".

## Layout and widths
Check 390px (phone), 900px, 1440px. The desk scales; posters wrap into a 5-up row on wide, a horizontal scroll strip
(snap) on phones. Body never scrolls sideways. Hit targets ≥ 44px.

## Tour anchors (the tutorial points at these; put them on the real elements)
`data-tour="slate"` lot board · `data-tour="buyers"` poster row · `data-tour="sell"` sell plaque · `data-tour="hold"` ·
`data-tour="envelopes"` revealed bids · `data-tour="ledger"` · `data-tour="evidence"` evidence count ·
`data-tour="leniency"` leniency plaque · `data-tour="next-day"` · `data-tour="mic"` back-room mic · `data-tour="ask-text"` typed question ·
`data-tour="pressure"` pressure gauge · `data-tour="verdict"` · `data-tour="casefile"`.

## Never
Rounded pills, glassmorphism, gradient-text headings, generic dashboard cards, Lucide-style icon soup, centered walls of text,
`opacity:0` content waiting on an observer, new fonts outside the table above, edits to `src/lib/**` logic.
