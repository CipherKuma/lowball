import {AbsoluteFill,Img,staticFile,useCurrentFrame} from 'remotion';
import {c,font} from '../theme';
import {ease,lerp,reveal} from '../motion';
import {take} from '../data/take';
import {PendingText} from './PendingText';
export type BoardCard={id:string;x:number;y:number;w:number;h:number;title:string;body:string;footer:string;at:number;angle:number;dark?:boolean};
const Pin = () => <div style={{position:'absolute',left:'calc(50% - 7.5px)',top:-5,width:15,height:15,borderRadius:'50%',background:'radial-gradient(circle at 35% 25%,#fb8062,#9c2a20 60%,#3b130e)',boxShadow:'0 0 0 3px #aa854b,3px 5px 5px #0008'}}/>;
const Card=({card}:{card:BoardCard})=>{
 const f=useCurrentFrame();const p=ease(f,card.at,card.at+22);
 return <div style={{position:'absolute',left:card.x,top:card.y,width:card.w,height:card.h,padding:'28px 30px 24px',zIndex:1,display:'flex',flexDirection:'column',boxSizing:'border-box',color:card.dark?c.paper:c.paperInk,background:card.dark?'linear-gradient(130deg,#183831,#0b1c1b)':'linear-gradient(120deg,#e6dcc4,#bda77d)',boxShadow:'4px 14px 27px #0009',border:card.dark?'1px solid #a88649':'1px solid #e7d1a2',transformOrigin:'50% 0px',transform:`translateY(${(1-p)*45}px) rotate(${card.angle}deg)`,opacity:p}}>
  <Pin/>
  <div style={{fontFamily:font.mono,fontSize:16,letterSpacing:'.15em',opacity:.65,marginBottom:12}}>{card.id}</div>
  <div style={{fontFamily:font.sign,fontWeight:card.dark?900:800,fontSize:card.dark?56:38,lineHeight:.95,textTransform:'uppercase',letterSpacing:'.01em',marginBottom:14}}>{card.title}</div>
  <div style={{fontFamily:font.mono,fontSize:22,lineHeight:1.45,whiteSpace:'pre-wrap',overflowWrap:'anywhere',overflow:'hidden',flex:1,minHeight:0}}><PendingText text={reveal(card.body,f,card.at+12,1.8)} dark={card.dark}/></div>
  <div style={{fontFamily:font.mono,fontSize:15,lineHeight:1.5,opacity:.85,marginTop:14,overflowWrap:'anywhere',overflow:'hidden',maxHeight:45,flexShrink:0,borderTop:'1px solid currentColor',paddingTop:12}}><PendingText text={card.footer} dark={card.dark}/></div>
 </div>;
};
export const RedString=({path,progress}:{path:string;progress:number})=><>
 <path d={path} fill="none" stroke="#170706" strokeWidth="7" transform="translate(2 5)" pathLength={1} strokeDasharray={1} strokeDashoffset={1-progress}/>
 <path d={path} fill="none" stroke={c.red} strokeWidth="3.5" pathLength={1} strokeDasharray={1} strokeDashoffset={1-progress}/>
 <path d={path} fill="none" stroke="#d1694a" strokeWidth=".8" pathLength={1} strokeDasharray={1} strokeDashoffset={1-progress}/>
</>;
export const CaseBoard=({proof=false}:{proof?:boolean})=>{
 const f=useCurrentFrame();const p=take.proof;
 const cards:BoardCard[]=proof?[
  {id:'01 / COMPUTE',x:110,y:110,w:510,h:285,title:'NEAR AI · TEE',body:p.nearAi.verified&&p.nearAi.tdx&&p.nearAi.gpu?`TDX ✓  GPU ✓\nSignatures ✓ ${take.live.receiptsVerified}`:'TDX / GPU / signature\nTODO: take verification',footer:take.api.model,at:0,angle:0},
  {id:'02 / KEYS',x:1300,y:110,w:510,h:285,title:'OutLayer enclave',body:p.outlayer.live&&p.outlayer.proven?'PROVEN\nBuyer signing keys':'Enclave mode: pact keys\nsign inside Intel TDX',footer:`${p.outlayer.attestation} · this take: standard mode`,at:26,angle:0},
  {id:'03 / ASSET',x:110,y:515,w:510,h:285,title:'NEP-245',body:`CATCH token\n${take.live.tokenId} · 275 kg`,footer:`mt_mint · tx ${take.receipts.mint}`,at:58,angle:0},
  {id:'04 / PAYOUT',x:1300,y:515,w:510,h:285,title:'Chain Signatures',body:`NEAR MPC → Sepolia\n${take.receipts.sepolia}`,footer:'MPC-signed transfer · an earlier season',at:86,angle:0},
  {id:'THE CASE',x:705,y:310,w:510,h:300,title:'Lowball',body:`NEP-519 yield\n${take.api.yieldBlocks} blocks`,footer:`offer_leniency · ${take.receipts.leniency}`,at:4,angle:0,dark:true},
 ]:[
  {id:'01 / THE MARKET',x:130,y:110,w:680,h:325,title:'The cartel sets the price.',body:`“${take.problem.quote}”`,footer:`${take.problem.attribution} · ${take.problem.quoteSource}`,at:0,angle:0},
  {id:'02 / THE AGENTS',x:1110,y:110,w:680,h:325,title:'Now the buyers are AI.',body:take.problem.research,footer:take.problem.researchSource,at:95,angle:0},
  {id:'THE GAME',x:615,y:515,w:690,h:280,title:'Lowball: break the cartel',body:'Make one talk.',footer:'A sealed-bid auction game on NEAR',at:203,angle:0,dark:true},
 ];
 const scale=lerp(f,0,proof?288:378,.97,1);
 const x=lerp(f,0,proof?288:378,12,0);
 const hub=proof?[960,312.5]:[960,517.5];
 const targets=proof?[[365,112.5,28],[1555,112.5,52],[365,517.5,76],[1555,517.5,100]]:[[470,112.5,230],[1450,112.5,260]];
 return <AbsoluteFill style={{overflow:'hidden',background:'#0c1514'}}>
  <Img src={staticFile('art/bg_casefile.webp')} style={{position:'absolute',width:'100%',height:'100%',objectFit:'cover',opacity:.23,transform:'scale(1.4)'}}/>
  <AbsoluteFill style={{background:'repeating-linear-gradient(2deg,#1e241b22 0px,#0000 3px,#0000 89px,#080b09aa 92px)'}}/>
  <AbsoluteFill style={{transform:`translate(${x}px,0px) scale(${scale})`}}>
   <svg width="1920" height="1080" style={{position:'absolute',zIndex:0,pointerEvents:'none'}}>
    {targets.map(([tx,ty,at],i)=>{
     const progress=ease(f,at,at+48);
     const elapsed=Math.max(0,f-at-48);
     const settle=Math.sin(elapsed/7)*Math.exp(-elapsed/22)*5;
     const sag=26+progress*12+settle;
     const path=`M ${hub[0]} ${hub[1]} Q ${(hub[0]+tx)/2} ${(hub[1]+ty)/2+sag} ${tx} ${ty}`;
     return <RedString key={i} path={path} progress={progress}/>;
    })}
   </svg>
   {cards.map(card=><Card key={card.id} card={card}/>)}
  </AbsoluteFill>
  <div style={{position:'absolute',inset:0,pointerEvents:'none',background:`radial-gradient(ellipse at ${35+Math.sin(f/120)*20}% 0%,#e8a33d22,transparent 65%)`}}/>
 </AbsoluteFill>;
};
