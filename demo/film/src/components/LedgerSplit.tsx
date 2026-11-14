import {AbsoluteFill,useCurrentFrame} from 'remotion';
import {take} from '../data/take';
import {c,font} from '../theme';
import {ease,lerp} from '../motion';
const WrittenNumber=({text,id,at}:{text:string;id:string;at:number})=>{
 const f=useCurrentFrame();const p=ease(f,at,at+35);
 return <svg width="640" height="155" viewBox="0 0 640 155">
  <defs><mask id={id}><path d="M-10 80 Q180 66 330 83T680 70" fill="none" stroke="white" strokeWidth="160" pathLength="1" strokeDasharray="1" strokeDashoffset={1-p}/></mask></defs>
  <text x="10" y="122" mask={`url(#${id})`} fill={c.paperInk} fontFamily={font.sign} fontWeight={900} fontSize={text.length>5?118:150}>{text.toUpperCase()}</text>
 </svg>;
};
export const LedgerSplit=()=>{
 const f=useCurrentFrame();const s=take.sim;
 return <AbsoluteFill style={{padding:'90px 120px',boxSizing:'border-box',background:'radial-gradient(ellipse at 50% 0%,#3b3725,#0b1418 70%)',perspective:1800}}>
  <div style={{fontFamily:font.typed,color:c.amber,fontSize:22,letterSpacing:'.2em',marginBottom:40}}>THE LEDGER / SIMULATION</div>
  <div style={{display:'flex',gap:24,transform:`translateY(${-f*.045}px) scale(${lerp(f,0,210,.96,1.015)})`}}>
   {[{title:'Without leniency',value:s.baseline.identical,label:'of lots had identical bids',shortfall:s.baseline.shortfall,rotate:-3,at:0},
    {title:'With leniency',value:s.immunity.confessions,label:'seasons saw a first confession',shortfall:s.immunity.shortfall,rotate:2,at:28}].map((p,i)=><div key={p.title} style={{width:820,height:650,padding:'50px 48px',boxSizing:'border-box',background:'repeating-linear-gradient(0deg,#0000 0 47px,#6a57351c 48px 49px),linear-gradient(115deg,#d6c9a8,#eee0be 60%,#c7b78e)',color:c.paperInk,boxShadow:'0 24px 45px #0009',transform:`rotate(${p.rotate+Math.sin(f/90)*.25}deg) rotateY(${i===0?3:-3}deg)`}}>
    <div style={{fontFamily:font.sign,fontWeight:800,fontSize:58,textTransform:'uppercase',letterSpacing:'.01em',marginBottom:24}}>{p.title}</div>
    <WrittenNumber text={p.value} id={`number-${i}`} at={p.at}/>
    <div style={{fontFamily:font.ui,fontSize:29,marginTop:15,marginBottom:48}}>{p.label}</div>
    <div style={{fontFamily:font.mono,fontSize:22,lineHeight:1.8,clipPath:`inset(0 ${100*(1-ease(f,p.at+40,p.at+67))}% 0 0)`}}>Mean shortfall / lot<br/><span style={{fontFamily:font.sign,fontWeight:900,fontSize:64}}>{p.shortfall}</span> marks</div>
    <svg width="640" height="26"><path d="M5 14 Q270 3 620 16" stroke={c.red} strokeWidth="4" fill="none" pathLength="1" strokeDasharray="1" strokeDashoffset={1-ease(f,p.at+65,p.at+90)}/></svg>
   </div>)}
  </div>
  <div style={{position:'absolute',right:130,top:92,textAlign:'right',color:c.paper,fontFamily:font.mono,fontSize:20}}>{s.caveat}</div>
  <div style={{position:'absolute',right:130,top:124,textAlign:'right',color:c.muted,fontFamily:font.mono,fontSize:16}}>Source: {s.source} · {s.calls} completions · {s.model}</div>
 </AbsoluteFill>;
};
