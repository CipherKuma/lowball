# Voices

Created with ElevenLabs Voice Design (`POST /v1/text-to-voice/design`, model `eleven_ttv_v3`, 3 previews per cast member), saved with `POST /v1/text-to-voice`. TTS model for lines: `eleven_v3`.

Selection note: candidates were chosen by measurable proxies (autocorrelation pitch estimate, sample duration as pace, STT intelligibility), not by human listening. The pitch estimator is noisy on gravelly voices. A human listen is still worth doing; swap ids in `voices.json` if a voice misses.

## narrator  `1pSjK1R2NZAimD0fb85p`
- Description used: Male, 40s-50s, a 1950s harbour radio dispatcher: dry, laconic, world-weary American baritone, close-mic, slightly nasal mid-century broadcast delivery, measured pace, subtle crackle of old radio.
- Preview picked: #1 of 0-2
- Why: mid-low pitch (~118 Hz est.), moderate pace of the three; closest to dry radio baritone
- TTS stability: see scripts/gen_vo.py

## marlow  `dCK9SovCB6A1EDcX4QDM`
- Description used: Male, 60s, old harbour boss: deep gravelly rasp, slow deliberate pace, East-coast American working-class accent, proud, smoker's voice, heavy and menacing but calm.
- Preview picked: #2 of 0-2
- Why: slowest delivery of 3 previews (22.1 s for the sample vs 17.8/20.3), most gravel
- TTS stability: see scripts/gen_vo.py

## odile  `xwYe5YLPeNMNOVcuFLV8`
- Description used: Female, 40s, cannery accountant: precise, clipped, cool and quiet, flat emotionless diction, slight mid-Atlantic accent, controlled, thin and dry, measured pace.
- Preview picked: #0 of 0-2
- Why: highest-pitched, cleanest female candidate (est. 158 Hz), clipped pace; stays distinct from Ines' lower smoky alto
- TTS stability: see scripts/gen_vo.py

## sully  `Vh5DH95TfnnwCiv0cUu6`
- Description used: Male, early 20s, young dockworker: nervous, anxious, fast-talking, breathy and high-strung, working-class Cockney-tinged accent, voice cracks, stammering.
- Preview picked: #0 of 0-2
- Why: fastest and highest-pitched of 3 (9.5 s for sample vs 12.7/16.7), reads as young and rushed
- TTS stability: see scripts/gen_vo.py

## ines  `RJ8buNDPSkB1g1bs25A8`
- Description used: Female, 30s, glamorous restaurateur: warm, amused, smoky low alto, seductive and charming, slightly husky, mid-century continental accent, unhurried and playful.
- Preview picked: #1 of 0-2
- Why: lower alto (est. 151 Hz) vs a brighter 190 Hz candidate; fits 'smoky' and sits apart from Odile
- TTS stability: see scripts/gen_vo.py

## deacon  `2jRaDASOiAITf9hugOnS`
- Description used: Male, 50s, silent clerical middleman: extremely low, slow, near-whisper, hushed and sepulchral, soft breathy baritone, calm and cold, serene menace.
- Preview picked: #2 of 0-2
- Why: lowest pitch (est. 80 Hz) and slowest of the near-whisper candidates (17.9 s sample)
- TTS stability: see scripts/gen_vo.py
