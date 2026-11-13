import os, sys, json, re, glob, subprocess, numpy as np, wave
A=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),".."))
RAW=sys.argv[1]; TMP=sys.argv[2]
PUB=os.path.abspath(f"{A}/../web/public/audio")
SR=44100
TARGET={"vo":-16,"music":-20,"sfx":-18}
LOOPS={"harbour_loop":2.0,"harbour_tense":2.0,"rain_loop":1.5,"lamp_buzz_loop":1.0}
FADEOUT={"confession_sting":1.0,"victory":0.8,"defeat":1.0}
MAXLEN={"confession_sting":4.2}
def sh(*a): return subprocess.run(list(a),capture_output=True)
def decode(f,ch):
    b=sh("ffmpeg","-v","quiet","-i",f,"-ac",str(ch),"-ar",str(SR),"-f","f32le","-").stdout
    return np.frombuffer(b,dtype=np.float32).reshape(-1,ch).copy()
def trim(x,thr=0.003,pad=int(0.03*SR)):
    m=np.abs(x).max(axis=1); idx=np.where(m>thr)[0]
    if len(idx)==0: return x
    return x[max(0,idx[0]-pad):min(len(x),idx[-1]+pad*3)]
def lufs(x):
    p=subprocess.run(["ffmpeg","-v","info","-f","f32le","-ar",str(SR),"-ac",str(x.shape[1]),"-i","-","-af","ebur128=peak=true","-f","null","-"],input=x.tobytes(),capture_output=True)
    t=p.stderr.decode(); s=t[t.rfind("Summary:"):]
    I=float(re.search(r"I:\s+(-?[\d.]+) LUFS",s).group(1)); 
    tp=re.search(r"Peak:\s+(-?[\d.]+) dBFS",s)
    return I,(float(tp.group(1)) if tp else None)
def encode(x,out_base):
    os.makedirs(os.path.dirname(out_base),exist_ok=True)
    kind=out_base.split("/")[-2]
    for ext,args in (("mp3",["-c:a","libmp3lame","-b:a","160k" if kind=="music" else "96k"]),("ogg",["-c:a","libopus","-b:a","96k" if kind=="music" else "48k"])):
        subprocess.run(["ffmpeg","-v","quiet","-y","-f","f32le","-ar",str(SR),"-ac",str(x.shape[1]),"-i","-",*args,f"{out_base}.{ext}"],input=x.tobytes(),check=True)
def limit(x,g):
    p=subprocess.run(["ffmpeg","-v","quiet","-f","f32le","-ar",str(SR),"-ac",str(x.shape[1]),"-i","-","-af",f"volume={g}dB,alimiter=limit=0.84:attack=2:release=30:level=disabled","-f","f32le","-"],input=x.tobytes(),capture_output=True)
    return np.frombuffer(p.stdout,dtype=np.float32).reshape(-1,x.shape[1]).copy()
man=[]
for f in sorted(glob.glob(f"{RAW}/*_*.mp3")):
    name=os.path.basename(f)[:-4]; kind,key=name.split("_",1)
    ch=2 if kind=="music" else 1
    x=decode(f,ch)
    loop=key in LOOPS
    if loop:
        c=int(LOOPS[key]*SR); N=len(x)
        a=x[:N-c].copy(); tail=x[N-c:]
        t=np.linspace(0,1,c)[:,None]
        a[:c]=a[:c]*np.sin(t*np.pi/2)+tail*np.cos(t*np.pi/2)
        x=a
    else:
        raw0=x[:]
        x=trim(x,0.0006 if kind=='music' else 0.003)
        if key in MAXLEN: x=raw0[:int(MAXLEN[key]*SR)]  # keep natural tail up to 4.2 s
        fo=FADEOUT.get(key,0.02 if kind!="vo" else 0.0)
        n=int(fo*SR)
        if n: x[-n:]*=np.linspace(1,0,n)[:,None]
    I,_=lufs(x)
    g=min(TARGET[kind]-I,24); y=x
    for _ in range(4):
        y=limit(x,g)
        I2,tp=lufs(y)
        if abs(I2-TARGET[kind])<0.3: break
        g+=TARGET[kind]-I2
    I2,tp=lufs(y)
    encode(y,f"{PUB}/{kind}/{key}")
    man.append({"key":key,"file":f"audio/{kind}/{key}.mp3","fileOgg":f"audio/{kind}/{key}.ogg","kind":kind,"durationSec":round(len(y)/SR,2),"loop":loop,"lufs":round(I2,1),"truePeakDb":tp})
    print(kind,key,round(len(y)/SR,2),"s",round(I2,1),"LUFS pk",tp)
json.dump(man,open(f"{A}/manifest.json","w"),indent=1)
