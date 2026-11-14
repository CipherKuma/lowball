import {ReactNode} from 'react';
import {AbsoluteFill,Freeze,Sequence,useCurrentFrame} from 'remotion';
import {ease} from '../motion';
// Incoming scene dissolves over an 18-frame held tail; source footage never overruns.
const Dissolve=({duration,first,children}:{duration:number;first:boolean;children:ReactNode})=>{
 const frame=useCurrentFrame();
 return <AbsoluteFill style={{opacity:first?1:ease(frame,0,18)}}>
  <Freeze frame={duration-1} active={frame>=duration}>{children}</Freeze>
 </AbsoluteFill>;
};
export const Scene=({from,durationInFrames,name,children}:{from:number;durationInFrames:number;name:string;children:ReactNode})=><Sequence from={from} durationInFrames={durationInFrames+18} name={name}>
 <Dissolve duration={durationInFrames} first={from===0}>{children}</Dissolve>
</Sequence>;
