# Prompts (v4 generation, 2026-11-14; the v3-era set is in `_archive/v3-2026-11-14/PROMPTS.md`)

Models: TTS `eleven_v4` (game VO, film narration, recap, wiretap) and `eleven_v4_turbo` (live buyer lines and interrogation answers, server runtime); STT `scribe_v3`; SFX `eleven_text_to_sound_v3`; music `music_v2_5`. Scripts: `scripts/gen_vo.py`, `gen_media.py`, `gen_narration.py`, `qa_vo.py`, `post.py`. Concurrency on this key is 2 for music and SFX.

## Voice design (see VOICES.md for full descriptions)
Sample texts per voice are in `scripts/design_voices.py`.

## Game VO (`POST /v1/text-to-speech/{voice}`, model eleven_v4, similarity_boost 0.8)
Text is `<tag> <line verbatim from lines.md>`. Stability per voice: narrator 0.5, marlow 0.4, odile 0.7, sully 0.3, ines 0.45, deacon 0.7. Two takes per line, the better kept by scribe_v3 transcript match plus duration sanity (see QA.md). Tags per line:

- intro_1: `[dry radio dispatcher, low and tired]`
- intro_2: `[dry radio dispatcher, low and tired]`
- day_open: `[dry radio dispatcher]`
- identical: `[dry radio dispatcher, flat]`
- leniency: `[dry radio dispatcher, lowering his voice]`
- confessed: `[dry radio dispatcher, quiet]`
- holdout: `[dry radio dispatcher, flat]`
- season_end_win: `[dry radio dispatcher, quietly relieved]`
- season_end_lose: `[dry radio dispatcher, weary]`
- marlow_greet: `[gravelly, slow, menacing]`
- marlow_bid: `[gravelly, menacing]`
- marlow_threat: `[gravelly, menacing, low voice]`
- marlow_betrayed: `[gravelly, furious, low voice]`
- odile_greet: `[cold, precise]`
- odile_bid: `[cold, precise]`
- odile_confess: `[cold, precise]`
- odile_betrayed: `[cold, precise, clipped]`
- sully_greet: `[nervous]`
- sully_bid: `[nervous, breathless]`
- sully_confess: `[breathless, panicked]`
- sully_betrayed: `[breathless, panicked]`
- ines_greet: `[warm, amused]`
- ines_bid: `[warm, amused]`
- ines_confess: `[amused, low voice]`
- ines_betrayed: `[amused, purring]`
- deacon_greet: `[whispering]`
- deacon_bid: `[low voice]`
- deacon_hold: `[low voice, whispering]`
- deacon_betrayed: `[whispering, low voice]`

## Film narration
`demo/narration.json` text verbatim, eleven_v4, voice Chris (`iP95p4xoKVk53GoZ742B`), stability 0.5, no tags. Two takes per segment, scribe_v3 pick, -16 LUFS.

## Music (`POST /v1/music`, model music_v2_5, force_instrumental; BPM, key and bar structure stated in each prompt)
- **harbour_loop** (95s requested): Instrumental only. Slow noir harbour jazz-ambient, D minor, 70 BPM, 4/4 with a gentle swing. The groove starts immediately on the first beat, no ambient intro and no fade-in: walking upright bass and brushed snare with soft rain underneath. After four bars add a muted trumpet playing a sparse, smoky melody over warm low piano chords. Patient, 1950s dockside at night, steady groove, no big drum fills, no vocals, no fade-out and no abrupt ending: the last bars keep playing the same groove and settle back to the same bass-and-brush texture as the start so the track loops seamlessly. About 95 seconds.
- **harbour_tense** (95s requested): Instrumental only. Sparse noir underscore, the same key and tempo as a slow harbour jazz track: D minor, 70 BPM, 4/4 with a gentle swing. The tension starts immediately on the first beat, no fade-in. A low double bass pulsing on D, cello holding a tense drone, minimal brushed drums barely audible, just a few distant muted trumpet notes, rain and a distant foghorn underneath. Anticipatory and uneasy, no resolution, no vocals, constant energy, no fade-out, so it loops seamlessly. About 95 seconds.
- **confession_sting** (5s requested): Instrumental only. A short noir crime-film sting, about 5 seconds: a single muted trumpet note held over a low string hit, a drop of dread, then sudden silence. D minor, no vocals.
- **victory** (12s requested): Instrumental only. A bittersweet noir victory cue, about 12 seconds, D minor, 70 BPM, 4/4 with a gentle swing: solo muted trumpet over soft upright bass and brushed drums, rising from D minor and resolving to a warm D major chord on the last bar, the ring is broken. Ends cleanly on a held final chord.
- **defeat** (9s requested): Instrumental only. A short noir defeat cue, about 9 seconds, D minor, 70 BPM, 4/4 with a gentle swing: a descending muted trumpet line over slow low strings, a heavy sigh of a final chord in D minor, fading out into rain.

## SFX (`POST /v1/sound-generation`, model eleven_text_to_sound_v3, prompt_influence 0.5; prompts describe action, setting and atmosphere)
- **rain_loop** (30s, loop:true): Steady rain falling on a warehouse window at night, heard from inside, close and even, a faint drip from a gutter, calm and lonely, no thunder, no wind gusts, seamless ambience
- **foghorn** (8s): A distant harbour foghorn sounding one long deep low blast over still water at night, slow swell and fade, faint echo off the pilings
- **gavel** (1.5s): A single sharp strike of a wooden auction gavel on a solid wooden block in a quiet room, dry, with a short wooden ring
- **wax_seal** (1.5s): A brass stamp pressing a hot wax seal onto paper at a desk, a soft thud with a slight wet squelch, then the stamp lifting away
- **paper_slide** (1.5s): A single sheet of paper sliding quickly across a zinc metal counter in a quiet room, a papery hiss that stops
- **folder_open** (2s): Someone opening a stiff manila folder on a desk and rustling the paper envelope inside, dry paper sounds in a quiet room
- **coins_pour** (3s): Handfuls of heavy metal coins being poured into a wooden strongbox, bright clinking that settles into a heap
- **bond_slash** (2.5s): A heavy iron chain snapping under tension with a hard metallic crack, immediately followed by one sharp blade slash through the air
- **auction_bell** (2s): A single short bright ring of a brass handbell at an auction hall, clear tone, quick decay
- **lamp_buzz_loop** (10s, loop:true): A sodium streetlamp humming and buzzing with a steady low electrical drone on a quiet foggy dock at night, constant and even, seamless loop
- **card_flip** (0.8s): A single playing card being flipped face up onto a wooden table, crisp snap of card stock and a soft landing
- **refusal_thud** (1.5s): A heavy thick oak door slamming shut with finality in a stone corridor, one dull deep thud with a short low rumble
- **ui_tick** (0.5s): A very soft subtle mechanical click, like a small brass switch, quiet and short
- **ui_hover** (0.6s): A very quiet soft whisper of cloth or paper brushing a surface, barely audible, brief

## Post
`scripts/post.py`: loops are cut to the groove (music: from first full-level onset, a whole number of 70 BPM bars, so the v2.5 ambient intro and fade-out are dropped) then the tail is blended into the head with an equal-power crossfade (2.0 s music / 1.5 s rain / 1.0 s lamp); silence trim; gain to LUFS target (vo -16, music -20, sfx -18) through ffmpeg alimiter; the true peak of the decoded mp3 and ogg is measured and gain reduced until both are at or below -1.5 dBTP (so very short, transient SFX land 0.3 to 3 dB under their LUFS target); mp3 + opus-in-ogg export. Confession sting: first 5.0 s of the raw 6.6 s with a 1 s fade.
