import {AbsoluteFill} from 'remotion';
import {Scene} from './components/Scene';
import {WorldTravel} from './components/WorldTravel';
import {CaseBoard} from './components/CaseBoard';
import {LedgerSplit} from './components/LedgerSplit';
import {Lockup} from './components/Lockup';
import {Atmosphere} from './components/Atmosphere';
import {Soundtrack,CaptionsAndSlotGuide} from './components/Soundtrack';
import {Handoffs} from './components/Handoffs';
import {Gameplay} from './scenes/Gameplay';
import {c,font} from './theme';
export type FilmProps={showGuide:boolean;audio:boolean};
// Scene frames mirror data/timeline.ts (seconds × 30).
export const Lowball=({showGuide=true,audio=true}:FilmProps)=> <AbsoluteFill style={{background:c.ink,fontFamily:font.ui}}>
 <Scene from={0} durationInFrames={210} name="00 · Identical"><Gameplay id="cold-open"/></Scene>
 <Scene from={210} durationInFrames={240} name="01 · Pier → warehouse → title"><WorldTravel journey/><Lockup intro/></Scene>
 <Scene from={450} durationInFrames={330} name="02 · The cartel / case board"><CaseBoard/></Scene>
 <Scene from={780} durationInFrames={300} name="03 · Before dawn"><Gameplay id="before-dawn"/></Scene>
 <Scene from={1080} durationInFrames={330} name="04 · Harbour chart → catch"><Gameplay id="day-one-lot"/></Scene>
 <Scene from={1410} durationInFrames={240} name="05 · Day 1 reveal"><Gameplay id="identical-bids"/></Scene>
 <Scene from={1650} durationInFrames={660} name="06 · Voice interrogation"><Gameplay id="interrogation"/></Scene>
 <Scene from={2310} durationInFrames={780} name="07 · Day 2 → leniency → confession"><Gameplay id="leniency"/></Scene>
 <Scene from={3090} durationInFrames={390} name="08 · The case file"><Gameplay id="case-file"/></Scene>
 <Scene from={3480} durationInFrames={255} name="09 · The proof / case board"><CaseBoard proof/></Scene>
 <Scene from={3735} durationInFrames={180} name="10 · The simulation ledger"><LedgerSplit/></Scene>
 <Scene from={3915} durationInFrames={135} name="11 · Make one talk"><WorldTravel/><Lockup/></Scene>
 <Handoffs/>
 <Atmosphere/>
 {audio&&<Soundtrack/>}
 <CaptionsAndSlotGuide showGuide={showGuide}/>
</AbsoluteFill>;
