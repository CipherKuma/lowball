import os, json, re, requests, sys
A=os.path.join(os.path.dirname(os.path.abspath(__file__)),"..")
K=os.environ["ELEVENLABS_API_KEY"]; H={"xi-api-key":K}
OUT=sys.argv[1]; only=set(sys.argv[2:])
voices=json.load(open(f"{A}/voices.json"))
STAB={"narrator":0.5,"marlow":0.5,"odile":1.0,"sully":0.0,"ines":0.5,"deacon":1.0}
sec=None; lines=[]
for l in open(f"{A}/lines.md"):
    m=re.match(r"## (\w+)",l)
    if m: sec=m.group(1); continue
    m=re.match(r'- (\w+): "(.*)"',l)
    if m: lines.append((sec,m.group(1),m.group(2)))
json.dump(lines,open(f"{OUT}/lines.json","w"))
for who,key,text in lines:
    if only and key not in only: continue
    r=requests.post(f"https://api.elevenlabs.io/v1/text-to-speech/{voices[who]}?output_format=mp3_44100_128",headers=H,
      json={"text":text,"model_id":"eleven_v3","voice_settings":{"stability":STAB[who],"similarity_boost":0.8}})
    if r.status_code!=200: print(key,r.status_code,r.text[:200]); continue
    open(f"{OUT}/vo_{key}.mp3","wb").write(r.content); print("ok",key)
