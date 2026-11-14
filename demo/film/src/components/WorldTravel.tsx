import {AbsoluteFill,Img,staticFile,useCurrentFrame} from 'remotion';
import {ease,lerp} from '../motion';
export const WorldTravel = ({journey=false}:{journey?:boolean}) => {
 const f=useCurrentFrame();const enter=journey?ease(f,56,122):1;
 return <AbsoluteFill style={{overflow:'hidden',background:'#0b1418'}}>
  {journey && <Img src={staticFile('art/bg_pier_title.webp')} style={{position:'absolute',width:'100%',height:'100%',objectFit:'cover',transformOrigin:'86% 52%',transform:`scale(${1+f*.0023}) translateX(${-f*.15}px)`,opacity:1-enter}}/>}
  <Img src={staticFile('art/bg_auction.webp')} style={{position:'absolute',width:'100%',height:'100%',objectFit:'cover',opacity:enter,transform:`scale(${journey?lerp(f,60,240,1.03,1.36):1.08+f*.00007}) translateY(${journey?lerp(f,60,240,0,-68):-16}px)`}}/>
  <div style={{position:'absolute',inset:0,background:'linear-gradient(0deg,#071013c9,transparent 55%,#07101355)'}}/>
  <Img src={staticFile('art/prop_chain.webp')} style={{position:'absolute',width:430,left:-210-f*.15,top:100,opacity:.65,transform:`rotate(${-5+Math.sin(f/90)*2}deg)`}}/>
  <Img src={staticFile('art/prop_lantern.webp')} style={{position:'absolute',width:620,right:-140+enter*50,top:-365+enter*100,transformOrigin:'50% 15%',transform:`rotate(${Math.sin(f/42)*4}deg)`,filter:'drop-shadow(0 30px 70px #e8a33d55)'}}/>
  <Img src={staticFile('art/prop_gavel.webp')} style={{position:'absolute',width:540,left:-170-f*.23,bottom:-280+enter*48,transform:`rotate(-18deg) scale(${1+f*.0004})`}}/>
 </AbsoluteFill>;
};
