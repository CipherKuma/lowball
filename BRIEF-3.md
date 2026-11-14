# Lowball — brief 3: ElevenLabs depth + real-world data (agent contract; terse)

Hand back by **12:00Z**. Testnet + existing keys only. Gabriel approved generous ElevenLabs use
(credits are plentiful); still cache everything you generate. Same git rules (explicit paths,
`features:` prefix, Claude-Session trailer). Files < 300 lines. zod on every input, `{error, code}`.

## Ownership (another agent is integrating OutLayer TEE in parallel)
You own: `server/src/features/**` (new), `server/scripts/fetch-noaa-prices.ts`,
`server/src/generated/prices.json`, `server/src/tts.ts`, `server/src/game/lots.ts`, `server/src/app.ts`
(add routes only), `server/src/game/state.ts` (add OPTIONAL fields only), `server/src/game/prompts.ts`
(only the additions below), `shared/api.ts` (additive only), tests under `server/test/features*.test.ts`.
Do NOT edit `setup.ts`, `leniency.ts`, `engine.ts`, `days.ts`, `chain/**`, `near/**`, `tee/**`, `llm/**`
except a one-line call site where unavoidable — then name it in the handback.

## F1 Real ex-vessel prices (NOAA Fisheries FOSS)
- Script queries NOAA Fisheries One Stop Shop (FOSS) commercial landings (find the current ODS/REST
  endpoint; e.g. `https://apps-st.fisheries.noaa.gov/ods/foss/landings/`) for the latest full year,
  for: Atlantic cod, Atlantic halibut, monkfish (goosefish), Atlantic bluefin tuna, black sea bass,
  American lobster. Aggregate dollars/pounds → USD per lb (national total; record state breakdown
  of the top state too). Write `prices.json` {species: {usdPerLb, year, pounds, dollars, topState,
  sourceUrl, query, fetchedAt}}. Never invent a number: if a species is missing, say so and fall back
  to the prior formula for that species only, flagged.
- `lots.ts`: fair value (marks) = round(weightKg × 2.20462 × usdPerLb × MARKS_PER_USD), with
  MARKS_PER_USD chosen so typical lots stay ~60–320 marks (document the constant). `day_opened`
  gains `market: {usdPerLb, year, source: 'NOAA Fisheries FOSS', url, state?}` (shared/api.ts).
## F2 Live sea state (Open-Meteo Marine, no key)
- At season begin, fetch `https://marine-api.open-meteo.com/v1/marine?latitude=41.63&longitude=-70.92&current=wave_height,wind_wave_height,swell_wave_height`
  (New Bedford, MA). Catch weight multiplier: calm 1.0, wave ≥ 2 m 0.75, ≥ 3.5 m 0.55. Emit
  `sea{waveM, swellM, port:'New Bedford, MA', source:'Open-Meteo Marine', at}` once per season and
  include it in the rumour/narrative context. Timeout 3 s; on failure, no multiplier and no event.
## F3 Interrogation (voice) — the headline feature
- `POST /api/session/:id/interrogate` multipart: `buyer` (BuyerId), `audio` (webm/ogg/mp4, ≤ 15 s,
  ≤ 1.5 MB) OR `text` (≤ 240 chars, typed fallback). One per day per session (`E_INTERROGATED`
  → `{error, code:'ALREADY_INTERROGATED'}`), only in lot_open/settled, not after a confession.
- Audio → ElevenLabs Speech-to-Text (`scribe_v1`, language auto) → question text.
- Buyer answers via the existing NEAR AI client (same TEE model + receipt) with a new prompt in
  `prompts.ts` `interrogationPrompt(id, s, question)`: private back-room scene, the fisher leans on
  them; output zod `{say ≤ 25 words, mood, pressure: -2..3, tell: string ≤ 12 words}` (`tell` = a
  visible nervous tic, for the UI). Persist `s.pressure[buyer]` (+= pressure, clamp 0..6) and the
  exchange in `s.interrogations[]`.
- `deliberatePrompt` gets one added line per interrogation: `On day N the fisher cornered you and
  said: "<question>". You answered: "<say>". Pressure on you now: P/6.` (no other change).
- Event `interrogation{buyer, question, answer, mood, tell, pressure}` + the answer is voiced via F5.
## F4 Wiretap (Case File)
- `GET /api/session/:id/wiretap` (only when phase closed, else 409 BAD_PHASE): render the private
  channel transcript as a multi-speaker scene with ElevenLabs Text-to-Dialogue (`eleven_v3`,
  inputs [{text, voice_id}] per line, buyer voices from audio/voices.json, add v3 audio tags from
  mood) → mp3. Cache (Cache API keyed by session) and stream. Include a 1-line narrator intro
  ("Recording recovered from the warehouse, season N.").
## F5 Expressive TTS
- `tts.ts`: buyer lines use `eleven_v3` with audio tags mapped from mood (calm→none, tense→[tense],
  cracking→[nervous] or [shaky], cold→[cold]) and a light `[pause]` where natural. Keep cache + caps
  (raise TTS_MAX_PER_SESSION to 80).
## F6 Day recap (narrator)
- After each `lot_settled`, emit `recap{text}` built from a TEMPLATE (no LLM), e.g. "Day 2. Halibut,
  fifty-five on the board. Sold for eighteen. Four envelopes, one number." Voiced with the narrator
  voice via `GET /api/tts?session&seq` (support `recap` events).
## Tests
vitest for: price formula + prices.json shape, sea-state multiplier + timeout fallback, interrogate
route validation/limits/state update (mock STT + LLM), wiretap phase gate, tts tag mapping, recap
template. Real calls: run F1 script for real (commit prices.json), and one real STT + one real
dialogue render locally (record results in `server/FEATURES-RUN.md`, no secrets).
Secrets: ELEVENLABS_API_KEY / NEARAI_API_KEY are in `server/.dev.vars` (read via process env in
scripts; never print).
## Handback
Endpoints + event shapes added to shared/api.ts (exact), test counts, real-run results, call sites
touched outside your ownership.
