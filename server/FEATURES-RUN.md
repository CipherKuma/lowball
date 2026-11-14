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
