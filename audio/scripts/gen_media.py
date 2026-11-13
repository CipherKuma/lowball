import os, json, requests, sys, concurrent.futures as cf
K=os.environ["ELEVENLABS_API_KEY"]; H={"xi-api-key":K}
OUT=sys.argv[1]; only=set(sys.argv[2:])
BASE="slow brushed-drum noir jazz, upright bass, muted trumpet, 70 bpm, key of D minor, 1950s harbour at night, rain, instrumental, no vocals"
MUSIC={
"harbour_loop":(BASE+", distant foghorn texture, smoky and patient, steady groove with a clean ending that can loop",90000),
"harbour_tense":(BASE.replace("slow brushed-drum noir jazz","sparse noir"),+0 or 0,) if False else
  ("sparse noir underscore, same key D minor and 70 bpm, low cello and double bass strings pulsing, minimal brushed drums, few muted trumpet notes, tense, anticipatory, rain, instrumental, no vocals",90000),
"confession_sting":("short dramatic noir sting, single muted trumpet note with a low string hit and a sudden silence, 1950s crime film, instrumental",5000),
"victory":("bittersweet noir victory cue, solo muted trumpet over soft upright bass and brushed drums, resolving from minor to warm major, the ring is broken, 70 bpm, instrumental, ends cleanly",13000),
"defeat":("short noir defeat cue, descending muted trumpet, slow low strings, heavy sigh, fades into rain, instrumental, 1950s",9000),
}
SFX={
"rain_loop":("steady rain falling on a warehouse window, close, seamless ambience, no thunder",30,True),
"foghorn":("distant harbour foghorn, deep low horn, long single blast over water",8,False),
"gavel":("single wooden auction gavel strike on a block, dry and sharp",1.5,False),
"wax_seal":("wax seal stamp pressed onto paper, soft thud with slight squelch",1.5,False),
"paper_slide":("sheet of paper sliding across a zinc metal counter",1.5,False),
"folder_open":("opening a paper folder and rustling envelope contents",2,False),
"coins_pour":("handfuls of metal coins pouring into a wooden strongbox",3,False),
"bond_slash":("heavy iron chain snapping then a sharp blade slash",2.5,False),
"auction_bell":("brass handbell ring, single short bright ring at an auction",2,False),
"lamp_buzz_loop":("sodium streetlamp electrical buzz and hum, steady, seamless loop",10,True),
"card_flip":("playing card flipped onto a wooden table, crisp",0.8,False),
"refusal_thud":("heavy dull thud of a thick oak door slamming shut with finality",1.5,False),
"ui_tick":("soft subtle mechanical click, quiet UI tick",0.5,False),
"ui_hover":("very quiet soft whisper of cloth or paper brush, subtle hover sound",0.6,False),
}
def music(k):
    p,ms=MUSIC[k]
    r=requests.post("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128",headers=H,json={"prompt":p,"music_length_ms":ms,"model_id":"music_v1","force_instrumental":True},timeout=600)
    if r.status_code!=200: return k,r.status_code,r.text[:300]
    open(f"{OUT}/music_{k}.mp3","wb").write(r.content); return k,"ok",""
def sfx(k):
    p,d,l=SFX[k]
    b={"text":p,"duration_seconds":d,"prompt_influence":0.5,"model_id":"eleven_text_to_sound_v2"}
    if l: b["loop"]=True
    r=requests.post("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",headers=H,json=b,timeout=300)
    if r.status_code!=200: return k,r.status_code,r.text[:300]
    open(f"{OUT}/sfx_{k}.mp3","wb").write(r.content); return k,"ok",""
jobs=[(music,k) for k in MUSIC]+[(sfx,k) for k in SFX]
jobs=[j for j in jobs if not only or j[1] in only]
with cf.ThreadPoolExecutor(2) as ex:
    for res in ex.map(lambda j:j[0](j[1]),jobs): print(*res)
