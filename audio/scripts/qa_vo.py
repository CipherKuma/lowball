import os, json, re, requests, sys, difflib
K=os.environ["ELEVENLABS_API_KEY"]; H={"xi-api-key":K}
D=sys.argv[1]
lines=json.load(open(f"{D}/lines.json"))
def norm(s): return re.sub(r"\s+"," ",re.sub(r"[^a-z0-9' ]"," ",s.lower().replace("—"," ").replace("’","'"))).strip()
res=[]
for who,key,text in lines:
    f=f"{D}/vo_{key}.mp3"
    r=requests.post("https://api.elevenlabs.io/v1/speech-to-text",headers=H,data={"model_id":"scribe_v1","language_code":"en","tag_audio_events":"false"},files={"file":open(f,"rb")})
    t=r.json().get("text","") if r.status_code==200 else f"ERR {r.status_code}"
    sim=difflib.SequenceMatcher(None,norm(text),norm(t)).ratio()
    res.append({"key":key,"script":text,"heard":t,"similarity":round(sim,3)})
json.dump(res,open(f"{D}/qa.json","w"),indent=1)
for x in res: print(x["key"],x["similarity"],"|",x["heard"])
