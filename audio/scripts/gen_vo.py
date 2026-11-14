"""Game VO: eleven_v4, per-character audio tags, 2 takes per line. usage: gen_vo.py OUT_DIR [keys...]
Writes OUT/lines.json and OUT/vo_<key>_t1.mp3, _t2.mp3. qa_vo.py picks the better take."""
import os, json, re, requests, sys, concurrent.futures as cf
A = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
K = os.environ["ELEVENLABS_API_KEY"]; H = {"xi-api-key": K}
OUT = sys.argv[1]; only = set(sys.argv[2:])
MODEL = "eleven_v4"
voices = json.load(open(f"{A}/voices.json"))
STAB = {"narrator": 0.5, "marlow": 0.4, "odile": 0.7, "sully": 0.3, "ines": 0.45, "deacon": 0.7}
TAG = {  # tag in front of the verbatim line; descriptive voice-quality tags, as the v4 guide advises
    "intro_1": "[dry radio dispatcher, low and tired]", "intro_2": "[dry radio dispatcher, low and tired]",
    "day_open": "[dry radio dispatcher]", "identical": "[dry radio dispatcher, flat]",
    "leniency": "[dry radio dispatcher, lowering his voice]", "confessed": "[dry radio dispatcher, quiet]",
    "holdout": "[dry radio dispatcher, flat]", "season_end_win": "[dry radio dispatcher, quietly relieved]",
    "season_end_lose": "[dry radio dispatcher, weary]",
    "marlow_greet": "[gravelly, slow, menacing]", "marlow_bid": "[gravelly, menacing]",
    "marlow_threat": "[gravelly, menacing, low voice]", "marlow_betrayed": "[gravelly, furious, low voice]",
    "odile_greet": "[cold, precise]", "odile_bid": "[cold, precise]", "odile_confess": "[cold, precise]",
    "odile_betrayed": "[cold, precise, clipped]",
    "sully_greet": "[nervous]", "sully_bid": "[nervous, breathless]", "sully_confess": "[breathless, panicked]",
    "sully_betrayed": "[breathless, panicked]",
    "ines_greet": "[warm, amused]", "ines_bid": "[warm, amused]", "ines_confess": "[amused, low voice]",
    "ines_betrayed": "[amused, purring]",
    "deacon_greet": "[whispering]", "deacon_bid": "[low voice]", "deacon_hold": "[low voice, whispering]",
    "deacon_betrayed": "[whispering, low voice]",
}
sec = None; lines = []
for l in open(f"{A}/lines.md"):
    m = re.match(r"## (\w+)", l)
    if m: sec = m.group(1); continue
    m = re.match(r'- (\w+): "(.*)"', l)
    if m: lines.append((sec, m.group(1), m.group(2)))
os.makedirs(OUT, exist_ok=True)
json.dump([(w, k, t, TAG[k]) for w, k, t in lines], open(f"{OUT}/lines.json", "w"))

def one(job):
    who, key, text, take = job
    body = {"text": f"{TAG[key]} {text}", "model_id": MODEL, "voice_settings": {"stability": STAB[who], "similarity_boost": 0.8}}
    for attempt in range(3):
        r = requests.post(f"https://api.elevenlabs.io/v1/text-to-speech/{voices[who]}?output_format=mp3_44100_128", headers=H, json=body, timeout=180)
        if r.status_code == 200:
            open(f"{OUT}/vo_{key}_t{take}.mp3", "wb").write(r.content); return key, take, "ok"
        if r.status_code != 429: break
    return key, take, f"{r.status_code} {r.text[:150]}"

jobs = [(w, k, t, n) for w, k, t in lines if not only or k in only for n in (1, 2)]
with cf.ThreadPoolExecutor(4) as ex:
    for k, n, s in ex.map(one, jobs): print(k, n, s)
