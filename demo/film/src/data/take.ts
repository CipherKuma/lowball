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
// Every value below is from take 2 (season 49, 14 Nov 2026 17:22 IST) or a check run on it; see demo/truth-ledger.md.
export const take = {
  identity: {session:'547e3fe3-c385-41a4-b8d2-514a312285c7', network:'NEAR testnet', recordedUrl:'https://play.lowball-game.pages.dev', previewMode:false, mode:'standard'},
  links: {play:'play.lowball-game.pages.dev', repo:'github.com/CipherKuma/lowball'},
  api: {endpoint:'POST cloud-api.near.ai/v1/chat/completions', model:'Qwen/Qwen3.6-35B-A3B-FP8', bondNear:'0.05', yieldBlocks:200},
  live: {season:'49', species:'bluefin tuna', swellMetres:'0.38', swellTime:'11:45 UTC', bid:'60',
    takenFromYou:'441', latencyMs:'3.0 s', signatureCount:'5', payout:'0.20', confessor:'Sully Brack',
    buyerTranscript:'I don’t know what you mean. Same? That’s just… bad luck, right?',
    fisherTranscript:'Sully, four envelopes said the same number yesterday. Who told you to write it?',
    browserSignature:'function-call key', tokenId:'s49-d1', interrogationReceipt:'d24476bad97d…', receiptsVerified:'26/26'},
  // Full hashes: demo/footage/take-2.casefile.json; outcomes re-read from testnet RPC (demo/truth-ledger.md).
  receipts: {season:'xAn5Bq8N…3qSxW', bond:'2JHdbadF…gmCtD', mint:'39eYF6CD…VsaJC', leniency:'8qt7a4o2…PaabeA', confess:'5Rgodoqx…xRn39',
    refusal:'r8WxNQYo…bM19h', refusal2:'4T3babAv…eProT', close:'2krVPp9p…PstZG', sepolia:'0x92fbe20e…610c'},
  verifiedTransactions:{season:true,bond:true,mint:true,leniency:true,confess:true,refusal:true,slash:true,payout:true,sepolia:true},
  proof: {nearAi:{verified:true,tdx:true,gpu:true,receipt:'d24476bad97d…'},
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
  review:{causalOrderApproved:false,visualReviewApproved:false,encodedMasterDecoded:false,
    masterLufs:null as number|null,truePeakDbtp:null as number|null,voiceLufs:null as number|null},
  // The day-1 lot of the recorded take (the Chart shows this species and its NOAA price).
  referenceSpecies:'bluefin tuna' as const,
  // Selects cut from demo/footage/raw/take-2-{a,b,c}.webm (see demo/footage/takes.md for source ranges).
  footage: [
    {id:'cold-open',from:0,to:7,title:'Five envelopes. One number.',expected:'',src:'footage/cold-open.mp4',sourceIn:0,focus:[42,30],provenance:'take-2-a 39.5–46.5 s'},
    {id:'before-dawn',from:26,to:36,title:'Before dawn',expected:'',src:'footage/before-dawn.mp4',sourceIn:0,focus:[50,45],provenance:'take-2-a 4–26 s at 2.2×',speed:[{from:0,to:10,label:'sped up ×2.2'}]},
    {id:'day-one-lot',from:36,to:47,title:'The first catch',expected:'',src:'footage/day-one-lot.mp4',sourceIn:0,focus:[45,80],provenance:'take-2-a 26–37 s'},
    {id:'identical-bids',from:47,to:55,title:'The price of silence',expected:'',src:'footage/identical-bids.mp4',sourceIn:0,focus:[45,32],provenance:'take-2-a 41–49 s'},
    {id:'interrogation',from:55,to:77,title:'Make him answer',expected:'',src:'footage/interrogation.mp4',sourceIn:0,focus:[55,42],provenance:'take-2-a 53–75 s'},
    {id:'leniency',from:77,to:103,title:'One chance to talk',expected:'',src:'footage/leniency.mp4',sourceIn:0,focus:[42,40],provenance:'take-2-a 85–97 s at 2× + take-2-b 1–21 s',speed:[{from:0,to:6,label:'sped up ×2'}]},
    {id:'case-file',from:103,to:116,title:'The case file',expected:'',src:'footage/case-file.mp4',sourceIn:0,focus:[50,45],provenance:'take-2-c 5–7.5, 13.5–16.5, 22–26.5, 83.9–86.9 s'},
  ] as MediaSlot[],
  narration,
  optionalOutlayerVoice:{source:'demo/vo/e07b.mp3',src:null as string|null,from:114,to:118},
  // The take's own audio, placed where the game played it (offsets from the event log and the recording).
  takeAudio:[
    {id:'deacon-line-d1',at:3.6,src:'take-audio/deacon-d1.mp3',duration:2.9,volume:.85,provenance:'line seq 24 · /api/tts'},
    {id:'actor-question',at:60.15,src:'take-audio/actor-question.mp3',duration:6.6,volume:.95,provenance:'actor recording fed to the mic (demo/actor/fisher-q1.wav)'},
    {id:'sully-answer',at:71.3,src:'take-audio/sully-answer.mp3',duration:4.5,volume:.95,provenance:'interrogation seq 30 · /api/tts'},
    {id:'deacon-line-leniency',at:91.6,src:'take-audio/deacon-len.mp3',duration:3.4,volume:.9,provenance:'line seq 52 · /api/tts'},
    {id:'wiretap',at:109.6,src:'take-audio/wiretap.mp3',startFrom:3.9,duration:3.8,volume:.9,provenance:'/api/session/…/wiretap, 3.9–7.7 s'},
  ] as TakeAudio[],
};
export const slot = (id:string) => {
  const result=take.footage.find(s=>s.id===id);
  if(!result) throw new Error(`Unknown footage slot: ${id}`);
  return result;
};
