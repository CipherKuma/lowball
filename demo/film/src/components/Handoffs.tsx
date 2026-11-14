import {Img,staticFile,useCurrentFrame} from 'remotion';
import {ease,lerp} from '../motion';
import {c,font} from '../theme';
// Transitional objects have one owner across each cut. No recorded UI is fabricated.
export const Handoffs=()=>{
 const f=useCurrentFrame();
 if(f>=427&&f<475){
  const p=ease(f,427,475);
  return <div style={{position:'absolute',left:lerp(p,0,1,670,115),top:lerp(p,0,1,570,160),width:680,height:215,background:'linear-gradient(120deg,#e6dcc4,#bda77d)',boxShadow:'0 30px 70px #000a',transform:`rotate(${lerp(p,0,1,8,-4)}deg) scale(${lerp(p,0,1,.3,1)})`,opacity:Math.min(1,lerp(f,427,438),lerp(f,460,475,1,0)),fontFamily:font.display,fontStyle:'italic',fontSize:70,color:c.paperInk,padding:40,boxSizing:'border-box'}}>Lowball</div>;
 }
 if(f>=757&&f<820){
  const p=ease(f,757,820);
  return <div style={{position:'absolute',left:lerp(p,0,1,615,1300),top:lerp(p,0,1,515,665),width:lerp(p,0,1,690,560),height:lerp(p,0,1,300,265),background:c.paper,boxShadow:'0 30px 70px #0009',transform:`rotate(${lerp(p,0,1,-2,-1.4)}deg)`,opacity:Math.min(1,lerp(f,757,771),lerp(f,797,820,1,0)),padding:38,boxSizing:'border-box',color:c.paperInk}}>
   <div style={{fontFamily:font.mono,fontSize:17,marginBottom:20}}>THE CASE / BEFORE DAWN</div><div style={{fontFamily:font.display,fontSize:44,fontStyle:'italic'}}>Break the cartel.</div>
   <svg width="550" height="80"><path d="M0 65Q250 85 540 15" stroke={c.red} strokeWidth="3" fill="none"/></svg>
  </div>;
 }
 if(f>=1058&&f<1100){
  const p=ease(f,1058,1100);
  return <div style={{position:'absolute',left:lerp(p,0,1,1160,95),top:lerp(p,0,1,520,150),width:lerp(p,0,1,650,570),height:lerp(p,0,1,300,650),background:`repeating-linear-gradient(0deg,#e6dcc408 0 1px,transparent 1px 90px),${c.harbour}`,border:`2px solid ${c.amber}88`,boxSizing:'border-box',transform:`rotate(${lerp(p,0,1,-1.4,0)}deg)`,opacity:Math.min(1,lerp(f,1058,1066),lerp(f,1080,1100,1,0))}}/>;
 }
 if(f>=3713&&f<3760){
  const p=ease(f,3713,3760);
  return <div style={{position:'absolute',inset:0,pointerEvents:'none',opacity:Math.min(1,lerp(f,3713,3723),lerp(f,3742,3760,1,0))}}>
   {[0,1].map(i=><div key={i} style={{position:'absolute',left:lerp(p,0,1,720+i*80,120+i*844),top:lerp(p,0,1,430,151),width:lerp(p,0,1,420,820),height:lerp(p,0,1,300,650),background:'linear-gradient(115deg,#d6c9a8,#eee0be)',boxShadow:'0 20px 55px #0008',transform:`rotate(${lerp(p,0,1,i?8:-8,i?2:-3)}deg)`}}/>)}
  </div>;
 }
 if(f>=3893&&f<3975){
  const p=ease(f,3893,3975);
  return <Img src={staticFile('art/prop_seal.webp')} style={{position:'absolute',width:lerp(p,0,1,90,145),left:lerp(p,0,1,1580,888),top:lerp(p,0,1,715,640),opacity:Math.min(1,lerp(f,3893,3905),lerp(f,3953,3975,1,0)),transform:`rotate(${lerp(p,0,1,20,0)}deg)`,filter:'drop-shadow(0 20px 25px #0009)'}}/>;
 }
 return null;
};
