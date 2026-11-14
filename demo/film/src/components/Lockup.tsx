import {AbsoluteFill,Img,spring,staticFile,useCurrentFrame} from 'remotion';
import {take} from '../data/take';
import {c,font} from '../theme';
import {ease,lerp} from '../motion';
export const Lockup=({intro=false}:{intro?:boolean})=>{
 const f=useCurrentFrame();const appears=ease(f,intro?110:0,intro?160:36);
 return <AbsoluteFill style={{justifyContent:'center',alignItems:'center',opacity:appears,transform:`translateY(${(1-appears)*45-f*.018}px) scale(${lerp(f,0,intro?240:270,.96,1.04)})`}}>
  <div style={{fontFamily:font.display,fontWeight:850,fontStyle:'italic',fontSize:238,letterSpacing:'-.065em',lineHeight:1.15,color:'#f3e7cf',textShadow:'0 0 65px #e8a33d55, 0 5px 3px #0007'}}>LOWBALL</div>
  <div style={{fontFamily:font.mono,color:c.amber,fontSize:21,letterSpacing:'.34em',marginTop:16,padding:'8px 18px',background:'#071013b8',textShadow:'0 2px 5px #000'}}>A GAME OF PRICE & BETRAYAL</div>
  {!intro && <>
   <div style={{fontFamily:font.display,fontSize:55,fontStyle:'italic',color:c.paper,marginTop:16}}>Make one talk.</div>
   <div style={{display:'flex',gap:44,height:160,marginTop:24,alignItems:'center'}}>
    {['SEALED BIDS','SIGNED PACTS','ONE WAY OUT'].map((s,i)=>{
     const start=38+i*13;const p=spring({frame:f-start,fps:30,config:{damping:12,stiffness:180}});
     return <div key={s} style={{position:'relative',width:145,height:145,opacity:f<start?0:1,transform:`rotate(${i*9-8}deg) scale(${1.8-p*.8})`}}>
      <Img src={staticFile('art/prop_seal.webp')} style={{width:145,filter:'drop-shadow(0 10px 13px #000a)'}}/>
      <div style={{position:'absolute',top:116,left:-26,width:200,textAlign:'center',fontFamily:font.mono,fontSize:14,color:c.paper,letterSpacing:'.08em'}}>{s}</div>
     </div>;
    })}
   </div>
   <div style={{fontFamily:font.ui,fontSize:32,color:c.paper,marginTop:32,opacity:ease(f,75,105)}}>{take.links.play}</div>
   <div style={{fontFamily:font.mono,fontSize:24,color:c.muted,marginTop:12,opacity:ease(f,88,118)}}>{take.links.repo}</div>
  </>}
 </AbsoluteFill>;
};
