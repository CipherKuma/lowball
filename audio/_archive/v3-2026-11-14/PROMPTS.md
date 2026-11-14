# Prompts

## Voice design (see VOICES.md for full descriptions)
Sample texts per voice are in `scripts/design_voices.py`.

## Lines
Text verbatim from `lines.md`, model eleven_v3, similarity_boost 0.8, stability narrator 0.5 / marlow 0.5 / odile 1.0 / sully 0.0 / ines 0.5 / deacon 1.0, no audio tags.

## Music (`POST /v1/music`, music_v1, force_instrumental)
- **harbour_loop** (90s requested): slow brushed-drum noir jazz, upright bass, muted trumpet, 70 bpm, key of D minor, 1950s harbour at night, rain, instrumental, no vocals, distant foghorn texture, smoky and patient, steady groove with a clean ending that can loop
- **harbour_tense** (90s requested): sparse noir underscore, same key D minor and 70 bpm, low cello and double bass strings pulsing, minimal brushed drums, few muted trumpet notes, tense, anticipatory, rain, instrumental, no vocals
- **confession_sting** (5s requested): short dramatic noir sting, single muted trumpet note with a low string hit and a sudden silence, 1950s crime film, instrumental
- **victory** (13s requested): bittersweet noir victory cue, solo muted trumpet over soft upright bass and brushed drums, resolving from minor to warm major, the ring is broken, 70 bpm, instrumental, ends cleanly
- **defeat** (9s requested): short noir defeat cue, descending muted trumpet, slow low strings, heavy sigh, fades into rain, instrumental, 1950s

## SFX (`POST /v1/sound-generation`, eleven_text_to_sound_v2, prompt_influence 0.5)
- **rain_loop** (30s, loop): steady rain falling on a warehouse window, close, seamless ambience, no thunder
- **foghorn** (8s): distant harbour foghorn, deep low horn, long single blast over water
- **gavel** (1.5s): single wooden auction gavel strike on a block, dry and sharp
- **wax_seal** (1.5s): wax seal stamp pressed onto paper, soft thud with slight squelch
- **paper_slide** (1.5s): sheet of paper sliding across a zinc metal counter
- **folder_open** (2s): opening a paper folder and rustling envelope contents
- **coins_pour** (3s): handfuls of metal coins pouring into a wooden strongbox
- **bond_slash** (2.5s): heavy iron chain snapping then a sharp blade slash
- **auction_bell** (2s): brass handbell ring, single short bright ring at an auction
- **lamp_buzz_loop** (10s, loop): sodium streetlamp electrical buzz and hum, steady, seamless loop
- **card_flip** (0.8s): playing card flipped onto a wooden table, crisp
- **refusal_thud** (1.5s): heavy dull thud of a thick oak door slamming shut with finality
- **ui_tick** (0.5s): soft subtle mechanical click, quiet UI tick
- **ui_hover** (0.6s): very quiet soft whisper of cloth or paper brush, subtle hover sound

## Post
scripts/post.py: loop crossfade (equal-power, 2.0 s music / 1.5 s rain / 1.0 s lamp, tail blended into head, length shortened by the fade), silence trim, gain to LUFS target (vo -16, music -20, sfx -18) through ffmpeg alimiter (ceiling -1.5 dBFS), mp3 + opus-in-ogg export. Confession sting: first 4.2 s of the raw 6.1 s with 1 s fade (the generated cue ended at ~3 s).
