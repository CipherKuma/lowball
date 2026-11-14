# BRIEF-3 real-API run (2026-11-14)

`npx tsx scripts/features-run.ts <outDir>` plays a 3-day season on the in-memory chain with the real NEAR AI buyer
model (Qwen TEE, thinking off, 26 completions) and real ElevenLabs / Open-Meteo / NOAA data. Keys come from
`.dev.vars` into the process environment and are never printed or written. Audio output stays outside the repo.

| feature | result |
|---|---|
| F1 NOAA FOSS | `npm run prices`: `https://apps-st.fisheries.noaa.gov/ods/foss/landings/` with `q={"ts_afs_name":"<name>","collection":"Commercial"}`. Year 2024 (2025 is rejected by the completeness guard: Atlantic cod 2025 reports 58% of 2024's pounds, below the 60% floor). See `src/generated/prices.json`. |
| F2 Open-Meteo | `sea` event emitted once, before day 1: waves 0.4 m, swell 0.26 m, multiplier 1.0, New Bedford, MA. |
| F3 interrogation | 4.8 s webm/opus clip (macOS `say` -> ffmpeg, 16 KB) -> scribe_v1 transcript: "Marlo, I have watched five identical bids in a row. Who set the price?" (actual: "Marlow"). Marlow answered in 1.5 s total (STT + Qwen): "The market speaks for itself. You're hearing echoes of a thirty-year silence." mood cold, pressure +0, tell "My thumb rubs the gold ring, slow and steady." |
| F5 expressive TTS | eleven_v3: the answer (`[cold]` tagged) rendered 6.3 s mp3, a bid line 3.4 s. |
| F6 recap | "Day one. Atlantic cod, one hundred thirty-four on the board. Sold for eighty-five. Five envelopes, one number. Marlow Teague took the catch." Narrator voice, 9.0 s mp3. |
| F4 wiretap | eleven_v3 Text-to-Dialogue, 11 inputs (narrator intro + 10 channel lines), 26.8 s to render, 77.8 s mp3 (622 KB). |

Day-opened samples (real price drives the marks): Atlantic cod 307 kg -> 134 marks at $1.99/lb; bluefin tuna 194 kg ->
206 marks at $4.81/lb; monkfish 1055 kg -> 158 marks at $0.68/lb.

## v4 upgrade (2026-11-14)

Runtime models now: buyer lines and interrogation answers `eleven_v4_turbo`; recap narrator `eleven_v4`; STT `scribe_v3` with 13 keyterms (Marlow, Odile, Sully, Ines, Deacon, Marguerite, Pier Nine, leniency, cartel, pact, bond, envelope, immunity); wiretap Text-to-Dialogue on `eleven_v4` with `audio_effects` `{filter_preset_id: low_quality_phone, environment_id: small_room, send_level: 0.3}` (the effects do not change request cost). Mood tags are descriptive v4 tags, e.g. `[gravelly, tense, low voice]`; a long line gets one ellipsis instead of `[pause]`; per-voice stability matches the pre-rendered VO. The wiretap text is shortened to fit Text-to-Dialogue's 2,000-character cap. `npx tsx scripts/v4-run.ts <outDir>` runs the checks below through the shipped code paths (real key, nothing printed or stored).

| check | result |
|---|---|
| live STT, 5.6 s webm/opus clip (macOS `say` -> ffmpeg, 18.8 KB), "Odile, Sully and Deacon signed the pact on the Marguerite. Who gets leniency, Marlow?" | with keyterms (766 ms): "Odile, Sully, and Deacon signed the pact on the Marguerite. Who gets leniency? Marlow." Without keyterms (874 ms): "Oh, deal. Sully and Deacon signed the pact on the Marguerite. Who gets leniency? Marlo." Keyterms fixed both names. The v1 run on 14 Nov had turned "Marlow" into "Marlo". |
| wiretap render, 7 inputs / 549 chars, v4 + effects | 9.0 s to render, 36.9 s stereo mp3 at 64 kbps, 296 KB (v3 run: 77.8 s clip, 622 KB, 26.8 s render for 11 inputs). scribe_v3 read it back word for word, so the lo-fi phone filter stays intelligible. Four effect presets compared (none, old_radio + small_room, phone, low_quality_phone + small_room): all transcribed identically; low_quality_phone has the strongest narrow-band tap character. |
| `eleven_v4_turbo` buyer line latency (full mp3 returned, uncached, 3 lines) | 624, 568, 539 ms (22 to 28 KB). `eleven_v4` narrator recap line for comparison: 2,042 ms (48.5 KB). |

## Forgery drill, real testnet (2026-11-14)

`RPC_URLS=https://test.rpc.fastnear.com,https://near-testnet.drpc.org npx tsx scripts/forge-run.ts`: a 2-day season on `lowball-ck.testnet`
(real chain, SCRIPTED buyers; this run is about the contract's refusals) closed as season 30 (46 s), then `POST /forge` logic ran in 25 s.

Why a drill season: on a closed season the contract answers E_CLOSED before it reaches any signature check, so `forge` and `replay` run in
a throwaway one-day season (31) the house opens with the same five buyers (0.001 NEAR bonds) and a throwaway player key it holds, which offers leniency.
That is the only way to get a live window without the real player's browser key. The drill season is closed afterwards (bonds refunded).

| attempt | season | contract code | tx |
|---|---|---|---|
| forge: confession signed by a fresh, unregistered ed25519 key | 31 (drill) | E_BAD_CONFESSION_SIG | [DBEZTvoodPSGPDdFwLZb4NVH6oCX5fLBFWHtYnyEULie](https://testnet.nearblocks.io/txns/DBEZTvoodPSGPDdFwLZb4NVH6oCX5fLBFWHtYnyEULie) |
| replay: season 30's pact and signatures into season 31 | 31 (drill) | E_SEASON_MISMATCH | [HZZvHbrZdNLQXSStaic5iz4uQ3EQvSeqWTRLM44NuiRG](https://testnet.nearblocks.io/txns/HZZvHbrZdNLQXSStaic5iz4uQ3EQvSeqWTRLM44NuiRG) |
| late: confess in the real season after it closed | 30 (real) | E_CLOSED | [5FJPKJDTvfAN5vnPJGyg3kS4xuxaorDG5oStP9jL1g1q](https://testnet.nearblocks.io/txns/5FJPKJDTvfAN5vnPJGyg3kS4xuxaorDG5oStP9jL1g1q) |
| cleanup: close the drill season | 31 | ok | [8Gc9p3vLAoxcU1UjkWzuhguBHCoaqGKwHWcB22R8Uakj](https://testnet.nearblocks.io/txns/8Gc9p3vLAoxcU1UjkWzuhguBHCoaqGKwHWcB22R8Uakj) |

Earlier attempts failed on infrastructure, not on the feature: the drill player's `offer_leniency` at the default 100 Tgas cost about 0.1 NEAR
(NotEnoughBalance, the player holds 0.05 and its key allowance is 0.04), so the new `offerLeniencyAs` attaches 30 Tgas; public testnet RPCs also rate-limited (429).
