import {AbsoluteFill,Audio,Sequence,staticFile,useCurrentFrame} from 'remotion';
import {take} from '../data/take';
import {soundCues} from '../data/timeline';
import {lerp} from '../motion';
import {font,c} from '../theme';
const F=(s:number)=>Math.round(s*30);
/** Music ducks under narration and under the take's own voices. */
const voiceAt=(frame:number)=>take.narration.some(s=>s.src&&frame>=F(s.from)-10&&frame<F(s.to)+12)
 ||take.takeAudio.some(a=>frame>=F(a.at)-10&&frame<F(a.at+a.duration)+12);
const Track=({src,seconds,gain,loop=false,start=0}:{src:string;seconds:number;gain:number;loop?:boolean;start?:number})=>
 <Audio src={staticFile(src)} loop={loop} volume={(af)=>{
  const duck=voiceAt(af+F(start))?.36:1;
  return gain*duck*lerp(af,0,24)*lerp(af,seconds*30-40,seconds*30,1,0);
 }}/>;
// Game music changes where the game changed it (take 10): harbour_tense once the wallet-signed leniency window opened
// (film ~91.4 s), the confession sting with Sully's confession (94.9 s), then the victory theme once the bonds were slashed.
export const Soundtrack=()=> <>
 <Sequence from={0} durationInFrames={F(92.4)} name="MUSIC · harbour_loop"><Track src="audio/music/harbour_loop.mp3" seconds={92.4} gain={.2} loop/></Sequence>
 <Sequence from={F(91.3)} durationInFrames={F(6.5)} name="MUSIC · harbour_tense"><Track src="audio/music/harbour_tense.mp3" seconds={6.5} start={91.3} gain={.17} loop/></Sequence>
 <Sequence from={F(94.9)} durationInFrames={F(6)} name="MUSIC · confession_sting"><Track src="audio/music/confession_sting.mp3" seconds={6} start={94.9} gain={.22}/></Sequence>
 <Sequence from={F(97.4)} durationInFrames={F(37.6)} name="MUSIC · victory"><Track src="audio/music/victory.mp3" seconds={37.6} start={97.4} gain={.18} loop/></Sequence>
 <Sequence from={0} durationInFrames={F(135)} name="SFX · rain"><Track src="audio/sfx/rain_loop.mp3" seconds={135} gain={.085} loop/></Sequence>
 <Sequence from={F(7)} durationInFrames={F(128)} name="SFX · lamp"><Track src="audio/sfx/lamp_buzz_loop.mp3" seconds={128} start={7} gain={.025} loop/></Sequence>
 {soundCues.map((s,i)=><Sequence key={i} from={F(s.at)} durationInFrames={90} name={`SFX · ${s.file}`}><Audio src={staticFile(`audio/sfx/${s.file}.mp3`)} volume={s.volume}/></Sequence>)}
 {take.narration.map(s=>s.src?<Sequence key={s.id} from={F(s.from)} durationInFrames={F(s.to)-F(s.from)+15} name={`VO · ${s.id}`}>
  <Audio src={staticFile(s.src)} volume={1}/>
 </Sequence>:null)}
 {take.takeAudio.map(a=><Sequence key={a.id} from={F(a.at)} durationInFrames={F(a.duration)} name={`TAKE AUDIO · ${a.id}`}>
  <Audio src={staticFile(a.src)} startFrom={F(a.startFrom??0)} volume={(af)=>a.volume*lerp(af,F(a.duration)-6,F(a.duration),1,0)}/>
 </Sequence>)}
</>;
export const CaptionsAndSlotGuide=({showGuide}:{showGuide:boolean})=>{
 const f=useCurrentFrame();const s=take.narration.find(s=>f>=F(s.from)&&f<F(s.to));
 const caption=s?.captionCues.find(cue=>f-F(s.from)>=cue.from&&f-F(s.from)<cue.to);
 return <AbsoluteFill style={{pointerEvents:'none',justifyContent:'flex-end',alignItems:'center',paddingBottom:24}}>
  {caption&&<div style={{fontFamily:font.ui,fontSize:30,lineHeight:1.3,maxWidth:1300,textAlign:'center',color:c.text,background:'#050a0de8',padding:'10px 25px',marginBottom:35,whiteSpace:'pre-line'}}>{caption.text}</div>}
  {showGuide&&s&&!s.src&&<div style={{fontFamily:font.mono,fontSize:16,letterSpacing:'.02em',color:c.muted,background:'#071014dd',padding:'8px 16px',border:'1px solid #a5814422'}}>NARRATION SLOT / {s.source} / re-voice for {s.from}–{s.to}s</div>}
 </AbsoluteFill>;
};
