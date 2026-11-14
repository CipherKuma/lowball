import {useCurrentFrame} from 'remotion';
import {ease,reveal} from '../motion';
import {c,font} from '../theme';
import {Stamp} from './Stamp';
import {PendingText} from './PendingText';
export type TelegramProps={title:string;lines:string[];verified?:boolean;label?:string;width?:number;compact?:boolean};
export const Telegram = ({title,lines,verified=false,label='RECEIPT PENDING',width=650,compact=false}:TelegramProps) => {
 const f=useCurrentFrame();const enter=ease(f,0,22);
 return <div style={{position:'relative',opacity:enter,width,minHeight:compact?210:290,padding:'28px 38px 34px',boxSizing:'border-box',color:c.paperInk,background:`repeating-linear-gradient(0deg,transparent 0 33px,#3a2b1810 34px 35px),linear-gradient(108deg,#e6dcc4,#c8b78f)`,border:'1px solid #e3c995',boxShadow:'0 30px 65px #000a, inset 0 0 55px #71532922',transform:`translate(${(1-enter)*90-f*.045}px,${(1-enter)*30+Math.sin(f/70)*4}px) rotate(${-1.4+f*.002}deg)`}}>
  <div style={{display:'flex',justifyContent:'space-between',fontFamily:font.mono,fontSize:15,letterSpacing:'.16em',borderBottom:'1px solid #50391b55',paddingBottom:12}}><span>LOWBALL / TELEGRAM</span><span>NEAR TESTNET</span></div>
  <div style={{fontFamily:font.display,fontSize:compact?29:35,fontWeight:500,margin:'15px 0 13px'}}>{title}</div>
  <div style={{fontFamily:font.mono,fontSize:compact?20:22,lineHeight:1.6,whiteSpace:'pre-wrap',overflowWrap:'anywhere',minHeight:lines.length*35}}><PendingText text={reveal(lines.join('\n'),f,15,2.2)}/></div>
  <div style={{display:'flex',justifyContent:'flex-end',marginTop:18}}><Stamp at={Math.max(38,Math.ceil(lines.join('').length/2.2)+15)} small verified={verified} text={verified?'VERIFIED':label}/></div>
 </div>;
};
