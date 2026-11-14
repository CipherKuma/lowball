"""Film narration: demo/narration.json -> demo/vo/<id>.mp3 with eleven_v4, voice Chris, plain delivery (no tags).
2 takes per segment, picked by scribe_v3 transcript match; loudness -16 LUFS, true peak <= -1.5 dBTP. usage: gen_narration.py WORK_DIR"""
import os, sys, json, re, difflib, subprocess, requests, concurrent.futures as cf
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
K = os.environ["ELEVENLABS_API_KEY"]; H = {"xi-api-key": K}
W = sys.argv[1]; os.makedirs(W, exist_ok=True)
VOICE = "iP95p4xoKVk53GoZ742B"  # Chris
KEYTERMS = ["NEAR", "NEP-245", "OutLayer", "TEE", "Lowball", "leniency", "cartel", "pact", "bond", "immunity"]
segs = json.load(open(f"{ROOT}/demo/narration.json"))
def norm(s): return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9' ]", " ", s.lower().replace("-", " "))).strip()
def stt(p):
    d = [("model_id", "scribe_v3"), ("language_code", "en"), ("tag_audio_events", "false")] + [("keyterms", k) for k in KEYTERMS]
    r = requests.post("https://api.elevenlabs.io/v1/speech-to-text", headers=H, data=d, files={"file": open(p, "rb")}, timeout=180)
    return r.json().get("text", "") if r.status_code == 200 else f"ERR {r.status_code}"
def gen(job):
    k, text, n = job
    r = requests.post(f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}?output_format=mp3_44100_128", headers=H, timeout=180,
        json={"text": text, "model_id": "eleven_v4", "voice_settings": {"stability": 0.5, "similarity_boost": 0.8}})
    if r.status_code != 200: return k, n, f"{r.status_code} {r.text[:120]}"
    open(f"{W}/{k}_t{n}.mp3", "wb").write(r.content); return k, n, "ok"
def meas(p):
    t = subprocess.run(["ffmpeg", "-nostats", "-i", p, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    s = t[t.rfind("Summary:"):]; return float(re.search(r"I:\s+(-?[\d.]+) LUFS", s).group(1)), float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", s).group(1))
def norm_loud(src, dst):
    g = -16 - meas(src)[0]
    for _ in range(5):
        subprocess.run(["ffmpeg", "-v", "quiet", "-y", "-i", src, "-af", f"volume={g}dB,alimiter=limit=0.80:attack=2:release=40:level=disabled", "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", dst], check=True)
        i, tp = meas(dst)
        if abs(i + 16) < 0.3 and tp <= -1.5: break
        g += (-16 - i) if tp <= -1.5 else min(-16 - i, -1.5 - tp - 0.2)
    return i, tp
jobs = [(k, t, n) for k, t in segs for n in (1, 2)]
with cf.ThreadPoolExecutor(2) as ex:
    for r in ex.map(gen, jobs): print(*r) if r[2] != "ok" else None
rows = []
for k, text in segs:
    best = None; info = []
    for n in (1, 2):
        p = f"{W}/{k}_t{n}.mp3"
        h = stt(p); sim = difflib.SequenceMatcher(None, norm(text), norm(h)).ratio()
        d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)
        sc = sim - 0.02 * max(0, d - 0.5 * len(text.split()) / 2.4 * 2)
        info.append((n, round(sim, 3), round(d, 2), h))
        if best is None or sc > best[0]: best = (sc, n, sim, d, h)
    i, tp = norm_loud(f"{W}/{k}_t{best[1]}.mp3", f"{ROOT}/demo/vo/{k}.mp3")
    rows.append({"id": k, "take": best[1], "similarity": round(best[2], 3), "durationSec": round(best[3], 2), "lufs": round(i, 1), "truePeakDb": tp, "heard": best[4]})
    print(k, "take", best[1], round(best[2], 3), round(best[3], 2), round(i, 1), tp)
json.dump(rows, open(f"{W}/narration_qa.json", "w"), indent=1)
