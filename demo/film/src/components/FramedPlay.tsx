import {AbsoluteFill,OffthreadVideo,staticFile,useCurrentFrame} from 'remotion';
import {MediaSlot} from '../data/take';
import {font,c} from '../theme';
import {lerp} from '../motion';
export const FramedPlay = ({slot,elapsed=0,compact=false}:{slot:MediaSlot;elapsed?:number;compact?:boolean}) => {
 const f=useCurrentFrame()+elapsed;const duration=(slot.to-slot.from)*30;
 const chartSlot=slot.id==='day-one-lot';
 const side=!['cold-open','identical-bids'].includes(slot.id);
 return <AbsoluteFill style={{padding:compact?'116px 86px 190px':'74px 86px 120px',perspective:1800}}>
  <div style={{position:'relative',width:'100%',height:'100%',overflow:'hidden',background:'#080f12',border:'2px solid #a3814e',boxShadow:'0 40px 90px #000b, 0 0 80px #e8a33d13',transform:`translate(${lerp(f,0,duration,-12,10)}px,${lerp(f,0,duration,7,-5)}px) rotateY(${lerp(f,0,duration,-1.2,1)}deg) scale(${lerp(f,0,duration,.975,1.025)})`}}>
   <div style={{position:'absolute',inset:9,border:'1px solid #b994522f',zIndex:2,pointerEvents:'none'}}/>
   {slot.speed?.filter(r=>f>=r.from*30&&f<r.to*30).map(r=><div key={r.label} style={{position:'absolute',left:30,bottom:26,zIndex:3,fontFamily:font.ui,fontSize:18,letterSpacing:'.03em',color:'rgba(255,255,255,.6)',background:'#050a0d99',padding:'4px 10px',opacity:Math.min(lerp(f,r.from*30,r.from*30+8),lerp(f,r.to*30-8,r.to*30,1,0))}}>{r.label}</div>)}
   {slot.src ? <OffthreadVideo src={staticFile(slot.src)} startFrom={slot.sourceIn} muted style={{width:'100%',height:'100%',objectFit:'cover',transformOrigin:`${slot.focus[0]}% ${slot.focus[1]}%`,transform:`scale(${lerp(f,0,duration,1,1.09)})`}}/> :
   <AbsoluteFill style={{justifyContent:'center',alignItems:side?'flex-start':'center',textAlign:side?'left':'center',padding:chartSlot?'65px 100px 110px 650px':side?'65px 850px 110px 95px':100,boxSizing:'border-box',background:'radial-gradient(ellipse at 58% 42%,#142420,#070e11 75%)'}}>
    <div style={{fontFamily:font.mono,fontSize:side?18:21,letterSpacing:'.22em',color:c.amber,marginBottom:34}}>FOOTAGE SLOT / {slot.id.toUpperCase()}</div>
    <div style={{fontFamily:font.display,fontStyle:'italic',fontSize:side?66:77,lineHeight:1.13,color:c.paper,marginBottom:25}}>{slot.title}</div>
    <div style={{fontFamily:font.ui,fontSize:side?27:29,lineHeight:1.45,maxWidth:1000,color:'#a7b4ac'}}>{slot.expected}</div>
    <div style={{fontFamily:font.mono,color:c.amber,fontSize:side?19:22,marginTop:38}}>{String(slot.from).padStart(3,'0')}–{String(slot.to).padStart(3,'0')} s · {slot.to-slot.from} s · REAL TAKE PENDING</div>
    <div style={{position:'absolute',bottom:40,left:45,right:45,height:2,background:'#b08b4d33'}}><div style={{height:2,width:`${lerp(f,0,duration,0,100)}%`,background:c.amber}}/></div>
   </AbsoluteFill>}
  </div>
 </AbsoluteFill>;
};
