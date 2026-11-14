"""Music (music_v2_5) + SFX (eleven_text_to_sound_v3). usage: gen_media.py OUT_DIR [keys...] -> OUT/music_<k>.mp3, OUT/sfx_<k>.mp3"""
import os, json, requests, sys, concurrent.futures as cf
K = os.environ["ELEVENLABS_API_KEY"]; H = {"xi-api-key": K}
OUT = sys.argv[1]; only = set(sys.argv[2:])
KEY = "D minor, 70 BPM, 4/4 with a gentle swing"
MUSIC = {  # key -> (prompt, ms)
"harbour_loop": (f"Instrumental only. Slow noir harbour jazz-ambient, {KEY}. The groove starts immediately on the first beat, no ambient intro and no fade-in: walking upright bass and brushed snare with soft rain underneath. After four bars add a muted trumpet playing a sparse, smoky melody over warm low piano chords. Patient, 1950s dockside at night, steady groove, no big drum fills, no vocals, no fade-out and no abrupt ending: the last bars keep playing the same groove and settle back to the same bass-and-brush texture as the start so the track loops seamlessly. About 95 seconds.", 95000),
"harbour_tense": (f"Instrumental only. Sparse noir underscore, the same key and tempo as a slow harbour jazz track: {KEY}. The tension starts immediately on the first beat, no fade-in. A low double bass pulsing on D, cello holding a tense drone, minimal brushed drums barely audible, just a few distant muted trumpet notes, rain and a distant foghorn underneath. Anticipatory and uneasy, no resolution, no vocals, constant energy, no fade-out, so it loops seamlessly. About 95 seconds.", 95000),
"confession_sting": ("Instrumental only. A short noir crime-film sting, about 5 seconds: a single muted trumpet note held over a low string hit, a drop of dread, then sudden silence. D minor, no vocals.", 5000),
"victory": (f"Instrumental only. A bittersweet noir victory cue, about 12 seconds, {KEY}: solo muted trumpet over soft upright bass and brushed drums, rising from D minor and resolving to a warm D major chord on the last bar, the ring is broken. Ends cleanly on a held final chord.", 12000),
"defeat": (f"Instrumental only. A short noir defeat cue, about 9 seconds, {KEY}: a descending muted trumpet line over slow low strings, a heavy sigh of a final chord in D minor, fading out into rain.", 9000),
}
SFX = {  # key -> (prompt, seconds, loop)
"rain_loop": ("Steady rain falling on a warehouse window at night, heard from inside, close and even, a faint drip from a gutter, calm and lonely, no thunder, no wind gusts, seamless ambience", 30, True),
"foghorn": ("A distant harbour foghorn sounding one long deep low blast over still water at night, slow swell and fade, faint echo off the pilings", 8, False),
"gavel": ("A single sharp strike of a wooden auction gavel on a solid wooden block in a quiet room, dry, with a short wooden ring", 1.5, False),
"wax_seal": ("A brass stamp pressing a hot wax seal onto paper at a desk, a soft thud with a slight wet squelch, then the stamp lifting away", 1.5, False),
"paper_slide": ("A single sheet of paper sliding quickly across a zinc metal counter in a quiet room, a papery hiss that stops", 1.5, False),
"folder_open": ("Someone opening a stiff manila folder on a desk and rustling the paper envelope inside, dry paper sounds in a quiet room", 2, False),
"coins_pour": ("Handfuls of heavy metal coins being poured into a wooden strongbox, bright clinking that settles into a heap", 3, False),
"bond_slash": ("A heavy iron chain snapping under tension with a hard metallic crack, immediately followed by one sharp blade slash through the air", 2.5, False),
"auction_bell": ("A single short bright ring of a brass handbell at an auction hall, clear tone, quick decay", 2, False),
"lamp_buzz_loop": ("A sodium streetlamp humming and buzzing with a steady low electrical drone on a quiet foggy dock at night, constant and even, seamless loop", 10, True),
"card_flip": ("A single playing card being flipped face up onto a wooden table, crisp snap of card stock and a soft landing", 0.8, False),
"refusal_thud": ("A heavy thick oak door slamming shut with finality in a stone corridor, one dull deep thud with a short low rumble", 1.5, False),
"ui_tick": ("A very soft subtle mechanical click, like a small brass switch, quiet and short", 0.5, False),
"ui_hover": ("A very quiet soft whisper of cloth or paper brushing a surface, barely audible, brief", 0.6, False),
}
def music(k):
    p, ms = MUSIC[k]
    r = requests.post("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", headers=H, json={"prompt": p, "music_length_ms": ms, "model_id": "music_v2_5", "force_instrumental": True}, timeout=900)
    if r.status_code != 200: return k, r.status_code, r.text[:300]
    open(f"{OUT}/music_{k}.mp3", "wb").write(r.content); return k, "ok", len(r.content)
def sfx(k):
    p, d, l = SFX[k]
    b = {"text": p, "duration_seconds": d, "prompt_influence": 0.5, "model_id": "eleven_text_to_sound_v3"}
    if l: b["loop"] = True
    r = requests.post("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", headers=H, json=b, timeout=300)
    if r.status_code != 200: return k, r.status_code, r.text[:300]
    open(f"{OUT}/sfx_{k}.mp3", "wb").write(r.content); return k, "ok", len(r.content)
if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    jobs = [(music, k) for k in MUSIC] + [(sfx, k) for k in SFX]
    jobs = [j for j in jobs if not only or j[1] in only]
    with cf.ThreadPoolExecutor(2) as ex:
        for res in ex.map(lambda j: j[0](j[1]), jobs): print(*res)
