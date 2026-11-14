import {useCurrentFrame} from 'remotion';
import {take} from '../data/take';
import {c,font} from '../theme';
import {ease,reveal} from '../motion';
import {PendingText} from './PendingText';
export const Chart=()=>{
 const f=useCurrentFrame();const species=take.live.species==='TODO'?take.referenceSpecies:take.live.species;
 const noaa=take.noaa[species as keyof typeof take.noaa];
 const enter=ease(f,0,32);const leave=ease(f,220,244);
 return <div style={{position:'absolute',left:95,top:150,width:570,height:650,overflow:'visible',transform:`translateX(${(1-enter)*-750-leave*90}px) rotate(${(1-enter)*-3}deg)`,opacity:enter*(1-leave),background:c.ink,border:`2px solid ${c.amber}88`,boxShadow:'12px 20px 42px #0008'}}>
  <div style={{position:'absolute',left:'calc(50% - 8px)',top:-6,width:16,height:16,borderRadius:'50%',background:'radial-gradient(circle at 35% 30%,#f5d095,#91612d)',boxShadow:'2px 4px 7px #0009',zIndex:2}}/>
  <svg width="568" height="280" viewBox="0 0 1920 1080" style={{position:'absolute',top:60}}>
   <defs><pattern id="chart-grid" width="96" height="96" patternUnits="userSpaceOnUse"><path d="M96 0H0V96" fill="none" stroke="#bda875" strokeOpacity=".15"/></pattern>
   <pattern id="land" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><path d="M0 0V14" stroke="#bda875" strokeOpacity=".18"/></pattern></defs>
   <rect width="1920" height="1080" fill="#122b29"/><rect width="1920" height="1080" fill="url(#chart-grid)"/>
   <g transform={`translate(${30-f*.12} ${20-f*.08}) scale(${1+f*.00022})`}>
    <path d="M0 0H650L620 110 680 160 655 245 745 300 710 390 760 450 700 530 780 650 690 780 730 850 590 930 550 1080H0Z M1920 0H1030L1060 100 1000 190 1040 280 1000 390 1120 450 1090 550 1190 620 1210 730 1310 780 1440 920 1520 1080H1920Z" fill="url(#land)" stroke="#bda875" strokeWidth="3"/>
    {Array.from({length:8},(_,i)=><path key={i} d={`M ${770+i*19} 50 Q ${660+i*25} 400 ${840+i*25} 650 T ${900+i*35} 1150`} fill="none" stroke="#bda875" strokeOpacity={.1+i*.012} strokeWidth="1.4"/>)}
    {Array.from({length:6},(_,i)=><path key={i} d={`M ${670+i*7} ${265+i*46} h ${85-i*5} v 13 h -${85-i*5}`} fill="#bda87533" stroke="#bda875"/>)}
    <path d="M728 430L1038 430" stroke="#bda875" strokeWidth="9" strokeDasharray="3 8"/>
    <path d="M900 1080 Q 1200 840 885 670 Q 760 520 890 280" fill="none" stroke={c.amber} strokeWidth="3" strokeDasharray="12 12" pathLength={1} strokeDashoffset={1-ease(f,15,125)}/>
    <g fill="#d7c69e" fontFamily={font.display}><text x="220" y="280" fontSize="62">New Bedford</text><text x="1150" y="260" fontSize="47">Fairhaven</text><text x="1000" y="930" fontSize="44" fontStyle="italic" letterSpacing="8">Buzzards Bay</text></g>
    <g transform="translate(835 620)"><circle r={19+(f%50)*.8} fill="none" stroke={c.amber} opacity={1-(f%50)/50}/><circle r="12" fill={c.amber}/><path d="M0 0L-130 130H-440" fill="none" stroke={c.amber} strokeWidth="2"/></g>
    <g transform="translate(1710 770)" stroke="#bda875" fill="none"><circle r="85"/><circle r="65"/><path d="M0 -110V110M-110 0H110M-60 -60L60 60M60 -60L-60 60"/><path d="M0 -85L14 0L0 85L-14 0Z" fill="#bda87566"/><text y="-128" textAnchor="middle" fill="#bda875" fontFamily={font.mono} fontSize="24">N</text></g>
   </g>
  </svg>
  <div style={{position:'absolute',left:24,top:28,fontFamily:font.mono,color:c.paper,fontSize:17,letterSpacing:'.08em'}}>NEW BEDFORD / FIELD NOTES</div>
  <div style={{position:'absolute',left:24,right:24,top:343,background:c.paper,color:c.paperInk,padding:'20px 26px',boxShadow:'3px 8px 20px #0006'}}>
   <div style={{fontFamily:font.mono,fontSize:16}}>NOAA FOSS / {noaa.year} · US ex-vessel</div>
   <div style={{fontFamily:font.display,fontSize:32,margin:'8px 0'}}>{reveal(species,f,20,1)}</div>
   <div style={{fontFamily:font.display,fontSize:42,fontStyle:'italic'}}>${noaa.usdPerLb.toFixed(4)}<span style={{fontSize:23}}> / lb</span></div>
   <div style={{fontFamily:font.mono,fontSize:16,marginTop:10}}><PendingText text={take.live.species==='TODO'?'TODO: take species · reference preview':'Recorded species'}/></div>
  </div>
  <div style={{position:'absolute',left:24,top:552,color:c.paper,fontFamily:font.mono,fontSize:24,lineHeight:1.5}}>Waves <PendingText dark text={take.live.swellMetres==='TODO'?'TODO m':`${take.live.swellMetres} m`}/><br/><span style={{fontSize:17,color:c.amber}}>Open-Meteo Marine · {take.live.swellMetres==='TODO'?'PENDING LIVE READING':`live, ${take.live.swellTime}`}</span></div>
  <div style={{position:'absolute',left:24,bottom:10,fontFamily:font.mono,fontSize:12,color:c.muted}}>SCHEMATIC · NOT FOR NAVIGATION</div>
 </div>;
};
