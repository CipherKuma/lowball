import {AbsoluteFill,Sequence,useCurrentFrame} from 'remotion';
import {slot,take} from '../data/take';
import {FramedPlay} from '../components/FramedPlay';
import {Telegram} from '../components/Telegram';
import {Chart} from '../components/Chart';
import {WorldTravel} from '../components/WorldTravel';
import {ease} from '../motion';
const ReceiptFade=({duration,children}:{duration:number;children:React.ReactNode})=>{
 const f=useCurrentFrame();return <div style={{opacity:1-ease(f,duration-18,duration-1)}}>{children}</div>;
};
type Place={right?:number;left?:number;bottom?:number;top?:number};
const BR:Place={right:60,bottom:150};
const Receipt=({title,lines,verified=false,label,from,duration=160,at=BR,width=560,compact=true}:{title:string;lines:string[];verified?:boolean;label?:string;from:number;duration?:number;at?:Place;width?:number;compact?:boolean})=> <Sequence from={from} durationInFrames={duration} name={`TELEGRAM · ${title}`}>
 <ReceiptFade duration={duration}><div style={{position:'absolute',...at}}><Telegram title={title} lines={lines} verified={verified} label={label} width={width} compact={compact}/></div></ReceiptFade>
</Sequence>;
export const Gameplay=({id}:{id:string})=>{
 const s=slot(id);const f=useCurrentFrame();const t=take;const v=t.verifiedTransactions;
 return <AbsoluteFill>
  <WorldTravel/>
  <FramedPlay slot={s}/>
  {id==='before-dawn'&&<>
   <Receipt from={44} duration={92} title="Signed in with your wallet" verified={v.season} lines={['NEAR Connect · Meteor',`NEP-413 · ${t.identity.wallet.split(' ')[0]}`,'one-time nonce, checked by the server']}/>
   <Receipt from={142} duration={74} title={`Season #${t.live.season} is written`} verified={v.season} lines={['create_season · 5 buyers · 6 days',`tx ${t.receipts.season}`]}/>
   <Receipt from={220} duration={80} title="Five bonds, locked" verified={v.bond} lines={[`post_bond · ${t.api.bondNear} Ⓝ each`,`tx ${t.receipts.bond}`]}/>
  </>}
  {id==='day-one-lot'&&<>
   <Chart/>
   <Receipt from={150} duration={175} title="The catch is a token" verified={v.mint} lines={[`NEP-245 mt_mint · ${t.live.tokenId}`,`${t.live.weightKg} kg · held in escrow`,`tx ${t.receipts.mint}`]}/>
  </>}
  {id==='interrogation'&&<>
   <Receipt from={165} duration={330} at={{left:60,top:350}} width={470} title="Your voice, to the buyer" lines={['ElevenLabs Scribe v3','→ Qwen3.6 in a NEAR AI TEE','→ his own ElevenLabs voice']} label="RECORDED LIVE"/>
   <Receipt from={510} duration={150} at={{left:60,top:350}} width={470} title="An attested answer" verified={t.proof.nearAi.verified} lines={[`receipt ${t.proof.nearAi.receipt}`,'TEE signature ✓',`release → answer ${t.live.latencyMs}`]}/>
  </>}
  {id==='leniency'&&<>
   <Receipt from={255} duration={205} title="You sign. The window opens." verified={v.leniency} lines={[`offer_leniency · signed in Meteor`,`NEP-519 yield · ${t.api.yieldBlocks} blocks`,`tx ${t.receipts.leniency}`]}/>
   <Receipt from={545} duration={145} title="The pact becomes evidence" verified={v.confess} lines={[`confess · ed25519 ×${t.live.signatureCount} · Sully`,'Ines, Odile: E_ALREADY_CONFESSED',`tx ${t.receipts.confess}`]}/>
  </>}
  {id==='cold-open'&&<div style={{position:'absolute',inset:0,pointerEvents:'none',boxShadow:`inset 0 0 ${180+f*.4}px #b8392c${Math.round(18+ease(f,50,180)*20).toString(16)}`}}/>}
 </AbsoluteFill>;
};
