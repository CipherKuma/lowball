import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {c} from '../theme';
export const Atmosphere = ({rain=true,grain=true}:{rain?:boolean;grain?:boolean}) => {
 const f=useCurrentFrame();
 return <AbsoluteFill style={{pointerEvents:'none'}}>
  {rain && <svg width="1920" height="1080" style={{position:'absolute',opacity:.13}}>
   {Array.from({length:72},(_,i)=>{const x=(i*383+f*1.7)%2100-90;const y=(i*173+f*(12+i%5))%1250-100;
    return <path key={i} d={`M ${x} ${y} l -14 63`} stroke={c.paper} strokeWidth={i%3===0?1.5:.6}/>;})}
  </svg>}
  <AbsoluteFill style={{background:`radial-gradient(ellipse at ${48+Math.sin(f/130)*9}% 24%, #e8a33d12, transparent 58%), radial-gradient(ellipse at 50% 42%,transparent 28%,#020909a8 100%)`}}/>
  {grain && <svg width="100%" height="100%" style={{opacity:.055,mixBlendMode:'soft-light'}}>
   <filter id="film-grain"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" seed={Math.floor(f/3)%17}/></filter>
   <rect width="100%" height="100%" filter="url(#film-grain)"/>
  </svg>}
 </AbsoluteFill>;
};
