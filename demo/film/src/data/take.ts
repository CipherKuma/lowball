// The film's single source of factual display values. No invented take results.
// Copy only the selected real take's files into public/footage, public/vo and public/take-audio.
import {narration} from './narration';
export type MediaSlot = {id:string; from:number; to:number; title:string; expected:string;
  src:string|null; sourceIn:number; focus:[number,number]; provenance:string|null;
  /** slot-relative seconds shown faster than real time, labelled on screen */
  speed?:{from:number;to:number;label:string}[]};
export type VoiceSlot = {id:string; from:number; to:number; source:string; src:string|null;
  captionCues:{from:number;to:number;text:string}[]};
/** A piece of the take's own audio (the game's TTS, the actor's question, the wiretap), placed in film seconds. */
export type TakeAudio = {id:string; at:number; src:string; startFrom?:number; duration:number; volume:number; provenance:string};
// Every value below is from take 10 (season 64, 15 Nov 2026 00:58 IST, played by cipherkuma.testnet through Meteor) or a
// check run on it; see demo/truth-ledger.md. Recorded on a local production build of ce51dc2 against the live API and contract.
export const take = {
  identity: {session:'7d314f91-d0fa-48f4-b05f-b2e249e417ba', network:'NEAR testnet', recordedUrl:'http://127.0.0.1:4399 (build of ce51dc2, live API + contract)', previewMode:false, mode:'standard', wallet:'cipherkuma.testnet (Meteor)'},
  links: {play:'play.lowball-game.pages.dev', repo:'github.com/CipherKuma/lowball'},
  api: {endpoint:'POST cloud-api.near.ai/v1/chat/completions', model:'Qwen/Qwen3.6-35B-A3B-FP8', bondNear:'0.05', yieldBlocks:200},
  live: {season:'64', species:'monkfish', weightKg:'926', swellMetres:'0.32', swellTime:'19:15 UTC', bid:'60',
    takenFromYou:'163', latencyMs:'4.2 s', signatureCount:'5', payout:'0.20', confessor:'Sully Brack',
    buyerTranscript:'Marguerite, I’m just a boy buying fish. I bid what I thought was right.',
    fisherTranscript:'Sully, four envelopes said the same number yesterday. Who told you to write it?',
    browserSignature:'Meteor wallet', tokenId:'s64-d1', interrogationReceipt:'a47f963d036a…', receiptsVerified:'26/26'},
  // Full hashes: demo/footage/take-10.casefile.json + events; leniency from NearBlocks (signer cipherkuma.testnet).
  receipts: {season:'Da9VdLxJ…nYQ2S', bond:'Ev4CXwZK…LSWaJ', mint:'CfgZBR3h…RZ54h', leniency:'58XrpDpt…T5Vjj', confess:'DZgEwTip…L3sdv',
    refusal:'6AoE5NLZ…VAZczF', refusal2:'6NRHxeqc…wnkKJ', close:'2gXVzzHe…9RUxi', sepolia:'0x92fbe20e…610c'},
  verifiedTransactions:{season:true,bond:true,mint:true,leniency:true,confess:true,refusal:true,slash:true,payout:true,sepolia:true},
  proof: {nearAi:{verified:true,tdx:true,gpu:true,receipt:'a47f963d036a…'},
    outlayer:{live:false,proven:false,attestation:'season 32 · confess 2Ad3j5Xk…',truthLedger:'demo/truth-ledger.md'},
    signaturesVerified:true,chainSignaturesVerified:true},
  problem: {quote:'stuck selling low and buying high', attribution:'WoW forums · Aug 2025',
    quoteSource:'us.forums.blizzard.com',
    research:'LLM pricing agents collude, and chain-of-thought monitoring cannot detect it.',
    researchSource:'arXiv 2609.18346 · 2026'},
  sim: {source:'server/sim/RESULTS.md', run:'2026-11-14T07:21:48.155Z',
    model:'Qwen/Qwen3.6-35B-A3B-FP8', chain:'MockChain', calls:470,
    baseline:{seasons:4,identical:'96%',shortfall:'153.4'},
    immunity:{seasons:10,identical:'86%',shortfall:'91.7',confessions:'9 of 10',rate:'90%',meanDay:'3.6'},
    caveat:'Real NEAR AI calls · mocked chain · 4 baseline / 10 leniency seasons'},
  noaa: {
  "Atlantic cod": {
    "usdPerLb": 1.9853,
    "year": 2024,
    "pounds": 1426780,
    "dollars": 2832592,
    "topState": {
      "state": "MASSACHUSETTS",
      "usdPerLb": 1.9803,
      "pounds": 1299179,
      "dollars": 2572733
    },
    "sourceUrl": "https://apps-st.fisheries.noaa.gov/ods/foss/landings/",
    "query": "{\"ts_afs_name\":\"COD, ATLANTIC\",\"collection\":\"Commercial\"} year=2024",
    "fetchedAt": "2026-11-14T08:54:17.258Z"
  },
  "halibut": {
    "usdPerLb": 6.2556,
    "year": 2024,
    "pounds": 77058,
    "dollars": 482047,
    "topState": {
      "state": "MAINE",
      "usdPerLb": 6.3202,
      "pounds": 39911,
      "dollars": 252245
    },
    "sourceUrl": "https://apps-st.fisheries.noaa.gov/ods/foss/landings/",
    "query": "{\"ts_afs_name\":\"HALIBUT, ATLANTIC\",\"collection\":\"Commercial\"} year=2024",
    "fetchedAt": "2026-11-14T08:54:17.258Z"
  },
  "monkfish": {
    "usdPerLb": 0.6811,
    "year": 2024,
    "pounds": 13085522,
    "dollars": 8911928,
    "topState": {
      "state": "MASSACHUSETTS",
      "usdPerLb": 0.6549,
      "pounds": 10057991,
      "dollars": 6587230
    },
    "sourceUrl": "https://apps-st.fisheries.noaa.gov/ods/foss/landings/",
    "query": "{\"ts_afs_name\":\"GOOSEFISH\",\"collection\":\"Commercial\"} year=2024",
    "fetchedAt": "2026-11-14T08:54:17.258Z"
  },
  "bluefin tuna": {
    "usdPerLb": 4.8078,
    "year": 2024,
    "pounds": 2424855,
    "dollars": 11658222,
    "topState": {
      "state": "MASSACHUSETTS",
      "usdPerLb": 4.6076,
      "pounds": 1042928,
      "dollars": 4805411
    },
    "sourceUrl": "https://apps-st.fisheries.noaa.gov/ods/foss/landings/",
    "query": "{\"ts_afs_name\":\"TUNA, BLUEFIN\",\"collection\":\"Commercial\"} year=2024",
    "fetchedAt": "2026-11-14T08:54:17.258Z"
  },
  "sea bass": {
    "usdPerLb": 2.6142,
    "year": 2024,
    "pounds": 4842650,
    "dollars": 12659879,
    "topState": {
      "state": "NEW JERSEY",
      "usdPerLb": 2.4903,
      "pounds": 1168555,
      "dollars": 2910102
    },
    "sourceUrl": "https://apps-st.fisheries.noaa.gov/ods/foss/landings/",
    "query": "{\"ts_afs_name\":\"BASS, BLACK SEA\",\"collection\":\"Commercial\"} year=2024",
    "fetchedAt": "2026-11-14T08:54:17.258Z"
  },
  "lobster": {
    "usdPerLb": 6.348,
    "year": 2024,
    "pounds": 113502141,
    "dollars": 720510650,
    "topState": {
      "state": "MAINE",
      "usdPerLb": 6.1493,
      "pounds": 87551725,
      "dollars": 538378737
    },
    "sourceUrl": "https://apps-st.fisheries.noaa.gov/ods/foss/landings/",
    "query": "{\"ts_afs_name\":\"LOBSTER, AMERICAN\",\"collection\":\"Commercial\"} year=2024",
    "fetchedAt": "2026-11-14T08:54:17.258Z"
  }
},
  // 14 Nov 18:40 IST. Causal order: every select checked against take-2 events (takes.md). Visual: 21 stills plus
  // frames either side of all 11 cuts, by Claude; nobody has watched it at full speed with sound yet (Gabriel's call).
  // Master: demo/out/lowball-demo.mp4 decoded end to end with 0 errors; ebur128 on the final file. voiceLufs is the
  // narration windows inside the master (-13.3 to -14.2): a narration-led film cannot hold VO at -16 under a -14 master.
  // 15 Nov 01:25 IST, take 10. Causal order checked against take-10.log; 24 frames across all cuts checked by Claude; a
  // Whisper transcript of the master hears every narration line and take voice in order. Nobody has watched it at full
  // speed with sound yet (Gabriel's call). Master decoded end to end with 0 errors; ebur128 on the final file. voiceLufs is
  // the narration windows inside the master (-13.5 to -14.2): a narration-led film cannot hold VO at -16 under a -14 master.
  review:{causalOrderApproved:true,visualReviewApproved:false,encodedMasterDecoded:true,
    masterLufs:-14.2 as number|null,truePeakDbtp:-1.4 as number|null,voiceLufs:-14.0 as number|null},
  // The day-1 lot of the recorded take (the Chart shows this species and its NOAA price).
  referenceSpecies:'monkfish' as const,
  // Selects cut by scratchpad/cut-take.mjs from demo/footage/raw/take-10-{a,m1,b,m2,c}.mp4 using the beat times in take-10.log.
  footage: [
    {id:'cold-open',from:0,to:7,title:'Five envelopes. One number.',expected:'',src:'footage/cold-open.mp4',sourceIn:0,focus:[42,30],provenance:'take-10-b 93.4–100.4 s'},
    {id:'before-dawn',from:26,to:36,title:'Your wallet, before dawn',expected:'',src:'footage/before-dawn.mp4',sourceIn:0,focus:[50,45],provenance:'take-10-a 13.1–14.7 s + take-10-m1 1.0–4.3 s (Meteor card, zoomed) + take-10-b 0.1–2.3 s (licence) + take-10-b 2.3–22.6 s at 7.0×',speed:[{from:7.1,to:10,label:'sped up ×7'}]},
    {id:'day-one-lot',from:36,to:47,title:'The first catch',expected:'',src:'footage/day-one-lot.mp4',sourceIn:0,focus:[45,80],provenance:'take-10-b 22.6–33.6 s'},
    {id:'identical-bids',from:47,to:55,title:'The price of silence',expected:'',src:'footage/identical-bids.mp4',sourceIn:0,focus:[45,32],provenance:'take-10-b 33.9–41.9 s'},
    {id:'interrogation',from:55,to:77,title:'Make him answer',expected:'',src:'footage/interrogation.mp4',sourceIn:0,focus:[55,42],provenance:'take-10-b 41.9–55.2 s at 7.0× (next day → Sully) + take-10-b 55.2–75.3 s',speed:[{from:0,to:1.9,label:'sped up ×7'}]},
    {id:'leniency',from:77,to:103,title:'One chance to talk',expected:'',src:'footage/leniency.mp4',sourceIn:0,focus:[42,40],provenance:'take-10-b 75.3–101.8 s at 4.1× + take-10-b 101.8–103.8 s + take-10-m2 0.9–6.9 s (Meteor card, zoomed) + take-10-c 3.3–14.8 s',speed:[{from:0,to:6.5,label:'sped up ×4'}]},
    {id:'case-file',from:103,to:116,title:'The case file',expected:'',src:'footage/case-file.mp4',sourceIn:0,focus:[50,45],provenance:'take-10-c 18.8–21.3, 25.5–29.3, 55.5–59.5, 98.6–101.3 s'},
  ] as MediaSlot[],
  narration,
  optionalOutlayerVoice:{source:'demo/vo/e07b.mp3',src:null as string|null,from:114,to:118},
  // The take's own audio, placed where the game played it (offsets from the event log and the recording).
  // Film times follow take-10.log: mic on at b 57.9 → 59.6; answer at b 70.8 → 72.5; the wiretap shot starts at deck 4.0 s.
  takeAudio:[
    {id:'deacon-line-d2',at:3.0,src:'take-audio/deacon-d1.mp3',duration:4.3,volume:.85,provenance:'line seq 40 (day 2) · /api/tts'},
    {id:'actor-question',at:59.7,src:'take-audio/actor-question.mp3',duration:6.6,volume:.95,provenance:'actor recording fed to the mic (demo/actor/fisher-q1.wav)'},
    {id:'sully-answer',at:72.6,src:'take-audio/sully-answer.mp3',duration:4.9,volume:.95,provenance:'interrogation seq 29 · /api/tts'},
    {id:'sully-line-leniency',at:91.9,src:'take-audio/sully-len.mp3',duration:3.3,volume:.9,provenance:'line seq 50 · /api/tts'},
    {id:'wiretap',at:109.3,src:'take-audio/wiretap.mp3',startFrom:2.5,duration:4.0,volume:.9,provenance:'/api/session/7d314f91…/wiretap, 2.5–6.5 s ("…Season 64. Cap at 60. Sign with me."), deck playing from c 53.0'},
  ] as TakeAudio[],
};
export const slot = (id:string) => {
  const result=take.footage.find(s=>s.id===id);
  if(!result) throw new Error(`Unknown footage slot: ${id}`);
  return result;
};
