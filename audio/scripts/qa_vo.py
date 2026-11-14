"""STT round-trip (scribe_v3 + keyterms) on both takes; picks the better one -> vo_<key>.mp3 and writes qa.json.
usage: qa_vo.py RAW_DIR   (after gen_vo.py)   |   qa_vo.py --final DIR_OF_FINAL_MP3S RAW_DIR  (QA the shipped files)"""
import os, json, re, requests, sys, difflib, subprocess, shutil, concurrent.futures as cf
K = os.environ["ELEVENLABS_API_KEY"]; H = {"xi-api-key": K}
KEYTERMS = ["Marlow", "Odile", "Sully", "Ines", "Deacon", "Marguerite", "Pier Nine", "leniency", "cartel", "pact", "bond", "envelope", "immunity"]
UK = {"civilized": "civilised", "harbor": "harbour", "favor": "favour", "around": "round", "cap'n": "captain", "morning": "mornin", "nothing": "nothin", "4": "four"}
def norm(s):
    s = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9' ]", " ", s.lower().replace("—", " ").replace("’", "'"))).strip()
    return " ".join(UK.get(w, w) for w in s.split())
def stt(path):
    data = [("model_id", "scribe_v3"), ("language_code", "en"), ("tag_audio_events", "false")] + [("keyterms", k) for k in KEYTERMS]
    for _ in range(3):
        r = requests.post("https://api.elevenlabs.io/v1/speech-to-text", headers=H, data=data, files={"file": open(path, "rb")}, timeout=180)
        if r.status_code == 200: return r.json().get("text", "")
    return f"ERR {r.status_code}"
def dur(path): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True).stdout)
def score(text, heard, d, tag):
    sim = difflib.SequenceMatcher(None, norm(text), norm(heard)).ratio()
    words = len(text.split()); exp = 0.45 * words + 0.8  # generous expected spoken length incl. tag lead-in
    over = max(0, d - 2.5 * exp - 1.5)  # runaway / rambling takes
    spoken_tag = any(w in norm(heard).split() for t in re.findall(r"\[([^\]]*)\]", tag) for w in norm(t).split() if len(w) > 4)
    return sim - 0.05 * over - (0.2 if spoken_tag else 0), sim, spoken_tag
if sys.argv[1] == "--final":
    D, R = sys.argv[2], sys.argv[3]
    lines = json.load(open(f"{R}/lines.json"))
    def f(l):
        who, key, text, tag = l; h = stt(f"{D}/{key}.mp3"); return {"key": key, "script": text, "heard": h, "similarity": round(difflib.SequenceMatcher(None, norm(text), norm(h)).ratio(), 3)}
    with cf.ThreadPoolExecutor(4) as ex: res = list(ex.map(f, lines))
    json.dump(res, open(f"{R}/qa_final.json", "w"), indent=1)
    for x in res: print(x["key"], x["similarity"], "|", x["heard"])
    sys.exit()
R = sys.argv[1]
lines = json.load(open(f"{R}/lines.json"))
def pick(l):
    who, key, text, tag = l; best = None; takes = []
    for n in (1, 2):
        p = f"{R}/vo_{key}_t{n}.mp3"
        if not os.path.exists(p): continue
        h = stt(p); d = dur(p); sc, sim, st = score(text, h, d, tag)
        takes.append({"take": n, "similarity": round(sim, 3), "dur": round(d, 2), "heard": h, "spoken_tag": st, "score": round(sc, 3)})
        if best is None or sc > best[0]: best = (sc, n)
    shutil.copy(f"{R}/vo_{key}_t{best[1]}.mp3", f"{R}/vo_{key}.mp3")
    return {"key": key, "script": text, "tag": tag, "chosen": best[1], "takes": takes}
with cf.ThreadPoolExecutor(4) as ex: res = list(ex.map(pick, lines))
json.dump(res, open(f"{R}/qa.json", "w"), indent=1)
for x in res: print(x["key"], "take", x["chosen"], [(t["similarity"], t["dur"]) for t in x["takes"]])
