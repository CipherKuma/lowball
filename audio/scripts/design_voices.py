import os, json, base64, requests, sys
K=os.environ["ELEVENLABS_API_KEY"]; H={"xi-api-key":K}
W=sys.argv[1]
V={
"narrator":("Male, 40s-50s, a 1950s harbour radio dispatcher: dry, laconic, world-weary American baritone, close-mic, slightly nasal mid-century broadcast delivery, measured pace, subtle crackle of old radio.",
 "Pier Nine. Four a.m. The fog's in, the boats are back, and the buyers are already waiting. Five of them. Same five every morning. Funny how they never seem to disagree."),
"marlow":("Male, 60s, old harbour boss: deep gravelly rasp, slow deliberate pace, East-coast American working-class accent, proud, smoker's voice, heavy and menacing but calm.",
 "Morning, captain. Let's keep this civilised. That's what it's worth. To us. Nobody on this pier talks. Nobody. You rat. After everything I did for this harbour."),
"odile":("Female, 40s, cannery accountant: precise, clipped, cool and quiet, flat emotionless diction, slight mid-Atlantic accent, controlled, thin and dry, measured pace.",
 "Your catch. Our price. Shall we. The arithmetic is not in your favour. The numbers changed. I simply followed them. An inefficient outcome. For me."),
"sully":("Male, early 20s, young dockworker: nervous, anxious, fast-talking, breathy and high-strung, working-class Cockney-tinged accent, voice cracks, stammering.",
 "Mornin'. Look, it's nothin' personal, yeah? Same as them. I, same as them. Okay. Okay! I'll tell you everything. Just keep my name clean."),
"ines":("Female, 30s, glamorous restaurateur: warm, amused, smoky low alto, seductive and charming, slightly husky, mid-century continental accent, unhurried and playful.",
 "Darling, you look exhausted. Sell to me and go to bed. It's a generous offer. Considering. Loyalty is lovely. Immunity is lovelier. Oh, you clever little thing."),
"deacon":("Male, 50s, silent clerical middleman: extremely low, slow, near-whisper, hushed and sepulchral, soft breathy baritone, calm and cold, serene menace.",
 "Peace be with you. As agreed. I have nothing to say to you. Judas. Peace be with you, my child. As agreed."),
}
only=sys.argv[2:] or list(V)
meta={}
for k in only:
    d,t=V[k]
    r=requests.post("https://api.elevenlabs.io/v1/text-to-voice/design",headers=H,json={"voice_description":d,"text":t,"model_id":"eleven_ttv_v3","auto_generate_text":False})
    if r.status_code!=200: print(k,r.status_code,r.text[:300]); continue
    j=r.json(); meta[k]=[]
    for i,p in enumerate(j["previews"]):
        open(f"{W}/prev_{k}_{i}.mp3","wb").write(base64.b64decode(p["audio_base_64"]))
        meta[k].append(p["generated_voice_id"])
    print(k,len(j["previews"]))
json.dump(meta,open(f"{W}/previews.json","w"))
