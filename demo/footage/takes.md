# Gameplay takes — 14 Nov 2026 (IST)

All takes: https://play.lowball-game.pages.dev on NEAR testnet, recorded with agent-browser in a headless Chrome launched
with `--mute-audio` (pid checked against the session's CDP port before every take), 1920×1080, `record --cursor`.
Nothing was played on the Mac's speakers; the film's sound is rebuilt from the game's own files and TTS endpoint.

Seam (disclosed): headless Chrome has no microphone, so the fisher's question is an ElevenLabs v4 actor recording
(`demo/actor/fisher-q1.wav`, voice "Jon Peters") injected as the page's `getUserMedia` stream. Everything after it is the
real game: MediaRecorder upload → ElevenLabs Scribe v3 → Qwen3.6 on NEAR AI Cloud (TEE) → ElevenLabs v4 buyer voice.

| Take | Session · season | Mode | Result | Use |
|---|---|---|---|---|
| 1 | 84be08e5 · 48 | standard | file-backed fake mic was silent; recorder died at ~5.5 min (MP4 unfinalized) | deleted |
| **2** | **547e3fe3 · 49** | standard | Sully (interrogated) confessed; Deacon and Odile refused `E_ALREADY_CONFESSED`; 4 slashed; 0.20 Ⓝ | **hero** |
| 3 | d969b842 · 51 | standard | Ines confessed; 3 slashed; no second confession | backup |
| 4 | 5733d89a · 53 | standard | day-2 sale hit a lagging RPC read (fixed in 4fcd6e6) | not used |
| 5 | 0a3e8f42 · 54 | standard | Sully confessed; 4 slashed; no second confession; final build | backup |
| 6 | — | — | refused by the per-IP season limit (RATE_LIMITED) | — |

Take 2 was recorded on the build before `2ac39b6`: its interrogation shows the stage direction in lower case and the
leniency button reads "Signing on NEAR…" during deliberation. Both were fixed after the take; the footage is unaltered.

## Take 2 timeline (segment-relative seconds; segments a / b / c restart the recorder)

Segment a (`raw/take-2-a.webm`, 97.8 s): 5 start · 8.3 account · 16.1 season 49 (`xAn5Bq8N…3qSxW`) · 18.6 bonds ×5 ·
18.9 cartel forming · 25.2 day 1 bluefin tuna 275 kg, NOAA $4.8078/lb, waves 0.38 m (`s49-d1`) · 36.7 commits ·
42.2 reveal: five bids of 60 · 50.4 day 2 halibut · 55 lean on Sully · 58–66 mic held · 69.0 answer on screen ·
85 day-2 sell · 93.5 reveal 60/0/60/60/60 (4 of 5 identical) · 93.8 settled.

Segment b (`raw/take-2-b.webm`, 22.3 s): 3 offer leniency (browser key) · 7.2 window open (`8qt7a4o2…PaabeA`,
deadline block 277653593) · 9.0 Deacon "I'm first." · 11.3 Deacon refused (`r8WxNQYo…bM19h`) · 11.6 Sully confessed
(`5Rgodoqx…xRn39`) · 13.6 Odile refused (`4T3babAv…eProT`) · 13.8 slashed ×4 · 16.5 season closed · 18.5 verdict card.

Segment c (`raw/take-2-c.webm`, 90.5 s): 5 case file · 13.5 five signatures re-checked in the browser · 22 back room /
wiretap · 50 on-chain record · 84.2 forgery drill results: `E_BAD_CONFESSION_SIG`, `E_SEASON_MISMATCH`, `E_CLOSED`.

## Selects (demo/film/public/footage)

| Select | Source | Film |
|---|---|---|
| cold-open.mp4 | a 39.5–46.5 | 0–7 |
| before-dawn.mp4 | a 4–26 at 2.2× (labelled) | 26–36 |
| day-one-lot.mp4 | a 26–37 | 36–47 |
| identical-bids.mp4 | a 41–49 | 47–55 |
| interrogation.mp4 | a 53–75 | 55–77 |
| leniency.mp4 | a 85–97 at 2× (labelled) + b 1–21 | 77–103 |
| case-file.mp4 | c 5–7.5, 13.5–16.5, 22–26.5, 83.9–86.9 (in order) | 103–116 |

Raw takes stay local until the final cut is approved, then go to Dropbox with `~/.agents/bin/media-offload`.

## Take 10 (final, wallet-first) — 15 Nov 2026 00:58 IST, season 64

- Player: **cipherkuma.testnet** in the Meteor web wallet (team recording wallet, Chrome on CDP 9412, approved by the team
  for testnet recording). Sign-in = NEAR Connect → Meteor "Sign Message: Sign in to Lowball"; leniency = Meteor
  "Approve Transaction" for `offer_leniency` (`58XrpDpt7WNFrxL7qwygCfAvVhKF6TsE1xS2NQBT5Vjj`).
- Origin: local production build of `ce51dc2` on `http://127.0.0.1:4399`, `/api` proxied to the live Worker (live testnet
  contract and API), per the rule that value-moving approvals happen on a local build.
- Segments (MP4/H.264, 24 fps, all real time): a (landing → Connect → picker → Meteor Web), m1 (Meteor sign message),
  b (licence → season → day 1 → day 2 back room → day 2 → Offer leniency), m2 (Meteor approve), c (verdict → case file).
  Beat times: `take-10.log`. Cut by `cut-take.mjs` (session scratchpad) into the film's slots; provenance per slot in
  `demo/film/src/data/take.ts`.
- Outcome: Sully confessed first; Ines and Odile refused `E_ALREADY_CONFESSED`; 4 bonds slashed, 0.20 NEAR paid to
  cipherkuma.testnet; 5/5 pact signatures re-checked in the browser; 3/3 forgeries refused. All tx outcomes re-read on
  testnet (demo/truth-ledger.md).
- The back-room question is the same actor recording fed through the page's getUserMedia seam (the recording browser
  has no microphone). Takes 2–9 are superseded; take 9 (season 62) was discarded because its gameplay segment dropped
  frames under machine load and played faster than real time.
