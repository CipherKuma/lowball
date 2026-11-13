import os, json, requests, sys, importlib.util
K=os.environ["ELEVENLABS_API_KEY"]; H={"xi-api-key":K}
W=sys.argv[1]
pick={"narrator":1,"marlow":2,"odile":0,"sully":0,"ines":1,"deacon":2}
prev=json.load(open(f"{W}/previews.json"))
src=open(os.path.join(os.path.dirname(__file__),"design_voices.py")).read()
ns={}; 
import re
V=eval(re.search(r"^V=(\{.*?^\})",src,re.S|re.M).group(1))
out={}
for k,i in pick.items():
    r=requests.post("https://api.elevenlabs.io/v1/text-to-voice",headers=H,json={"voice_name":f"Lowball {k}","voice_description":V[k][0],"generated_voice_id":prev[k][i]})
    print(k,r.status_code,r.text[:120] if r.status_code!=200 else "")
    if r.status_code==200: out[k]=r.json()["voice_id"]
json.dump(out,open(os.path.join(os.path.dirname(__file__),"..","voices.json"),"w"),indent=2)
print(out)
