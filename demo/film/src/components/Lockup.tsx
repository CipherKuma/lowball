import {AbsoluteFill,Img,spring,staticFile,useCurrentFrame} from 'remotion';
import {take} from '../data/take';
import {c,font,neon} from '../theme';
import {ease,lerp} from '../motion';
/** The neon sign stutters on, like the landing page's: on, off, on, half, on. */
const flicker=(t:number)=>t<0?0:t<4?1:t<7?.15:t<11?1:t<13?.3:1;
export const Lockup=({intro=false}:{intro?:boolean})=>{
 const f=useCurrentFrame();const appears=ease(f,intro?110:0,intro?160:36);
 return <AbsoluteFill style={{justifyContent:'center',alignItems:'center',opacity:appears,transform:`translateY(${(1-appears)*45-f*.018}px) scale(${lerp(f,0,intro?240:270,.96,1.04)})`}}>
  <div style={{fontFamily:font.sign,fontWeight:800,fontSize:24,letterSpacing:'.28em',color:c.paper,padding:'9px 30px 8px',background:'linear-gradient(180deg,#5a3d22,#3a2717)',boxShadow:'0 8px 16px #0009',transform:'rotate(-1.2deg)',marginBottom:18}}>PIER NINE · FISH AUCTION · 4 A.M.</div>
  <div style={{fontFamily:font.sign,fontWeight:900,fontSize:250,letterSpacing:'.015em',lineHeight:.82,...neon,opacity:intro?flicker(f-110):1}}>LOWBALL</div>
  <div style={{fontFamily:font.typed,color:c.amber,fontSize:22,letterSpacing:'.3em',marginTop:26,padding:'8px 18px',background:'#071013b8',textShadow:'0 2px 5px #000'}}>A GAME OF PRICE &amp; BETRAYAL</div>
  {!intro && <>
   <div style={{fontFamily:font.display,fontSize:55,fontStyle:'italic',color:c.paper,marginTop:16}}>Make one talk.</div>
   <div style={{display:'flex',gap:44,height:160,marginTop:24,alignItems:'center'}}>
    {['SEALED BIDS','SIGNED PACTS','ONE WAY OUT'].map((s,i)=>{
     const start=38+i*13;const p=spring({frame:f-start,fps:30,config:{damping:12,stiffness:180}});
     return <div key={s} style={{position:'relative',width:145,height:145,opacity:f<start?0:1,transform:`rotate(${i*9-8}deg) scale(${1.8-p*.8})`}}>
      <Img src={staticFile('art/prop_seal.webp')} style={{width:145,filter:'drop-shadow(0 10px 13px #000a)'}}/>
      <div style={{position:'absolute',top:116,left:-26,width:200,textAlign:'center',fontFamily:font.typed,fontSize:15,color:c.paper,letterSpacing:'.08em'}}>{s}</div>
     </div>;
    })}
   </div>
   <div style={{fontFamily:font.ui,fontSize:32,color:c.paper,marginTop:32,opacity:ease(f,75,105)}}>{take.links.play}</div>
   <div style={{fontFamily:font.mono,fontSize:24,color:c.muted,marginTop:12,opacity:ease(f,88,118)}}>{take.links.repo}</div>
  </>}
 </AbsoluteFill>;
};
