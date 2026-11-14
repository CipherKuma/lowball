import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {take} from '../src/data/take';
import {scenes,soundCues} from '../src/data/timeline';
import manifest from '../src/data/assets.json';
const delivery=process.argv.includes('--delivery');
const failures:string[]=[];
const pending:string[]=[];
let checks=0;
function check(condition:unknown,message:string){checks++;if(!condition)failures.push(message);}
const localPath=z.string().regex(/^[a-zA-Z0-9_./-]+$/).refine(p=>!p.includes('..')&&!p.startsWith('/'));
const media=z.object({id:z.string().min(1),from:z.number().nonnegative(),to:z.number().positive(),src:localPath.nullable(),sourceIn:z.number().int().nonnegative(),provenance:z.string().nullable(),focus:z.tuple([z.number().min(0).max(100),z.number().min(0).max(100)])});
for(const s of take.footage){
 check(media.safeParse(s).success,`Invalid footage boundary: ${s.id}`);
 check(s.to>s.from,`Empty footage range: ${s.id}`);
 if(s.src){check(fs.existsSync(path.join('public',s.src)),`Missing footage: ${s.src}`);check(!!s.provenance,`No provenance: ${s.id}`);}
 else pending.push(`Footage ${s.id} (${s.from}–${s.to}s)`);
}
check(scenes[0].from===0&&scenes.at(-1)?.to===135,'Composition must cover 0–135s');
for(let i=0;i<scenes.length;i++){const s=scenes[i];check(s.to>s.from,`Empty scene: ${s.id}`);if(i)check(scenes[i-1].to===s.from,`Gap/overlap before ${s.id}`);}
for(const asset of manifest){
 const file=path.join('public',asset.public);check(fs.existsSync(file),`Missing asset ${file}`);
 if(fs.existsSync(file)){check(!fs.lstatSync(file).isSymbolicLink(),`Symlink forbidden: ${file}`);check(createHash('sha256').update(fs.readFileSync(file)).digest('hex')===asset.sha256,`Asset hash changed ${file}`);}
}
for(const cue of soundCues)check(fs.existsSync(`public/audio/sfx/${cue.file}.mp3`),`Missing sound ${cue.file}`);
for(const s of take.narration){
 if(s.src){check(localPath.safeParse(s.src).success,`Unsafe voice path: ${s.id}`);check(fs.existsSync(`public/${s.src}`),`Missing narration: ${s.id}`);check(s.captionCues.length>0,`Missing captions: ${s.id}`);}
 else pending.push(`Narration ${s.id}: ${s.source}`);
 for(const cue of s.captionCues)check(cue.from>=0&&cue.to>cue.from&&cue.to<=(s.to-s.from)*30&&cue.text.split('\n').length<=2,`Caption timing/line limit: ${s.id}`);
}
for(const s of take.takeAudio){if(s.src)check(fs.existsSync(`public/${s.src}`),`Missing take audio: ${s.id}`);else pending.push(`Real take audio: ${s.id}`);}
for(const [key,verified] of Object.entries(take.verifiedTransactions)){if(verified)check(take.receipts[key as keyof typeof take.receipts]!=='TODO',`Verified transaction has no receipt: ${key}`);}
check(take.live.species==='TODO'||take.live.species in take.noaa,'Unrecognised NOAA species');
check(!take.identity.previewMode,'Preview mode footage is forbidden');
if(take.proof.nearAi.verified)check(take.proof.nearAi.tdx&&take.proof.nearAi.gpu&&take.proof.nearAi.receipt!=='TODO','NEAR AI VERIFIED needs TDX/GPU/receipt evidence');
if(take.proof.outlayer.proven)check(take.proof.outlayer.live&&take.proof.outlayer.attestation!=='TODO'&&take.proof.outlayer.truthLedger!=='TODO','OutLayer PROVEN needs live evidence and truth ledger');
if(take.optionalOutlayerVoice.src)check(take.proof.outlayer.live&&take.proof.outlayer.proven,'e07b requires live proven OutLayer');
const noaa=JSON.parse(fs.readFileSync('../../server/src/generated/prices.json','utf8'));
check(JSON.stringify(noaa)===JSON.stringify(take.noaa),'NOAA snapshot differs from server/src/generated/prices.json; refresh take.ts');
const results=fs.readFileSync('../../server/sim/RESULTS.md','utf8');
for(const v of ['96%','86%','153.4','91.7','90% (9/10)','470'])check(results.includes(v),`Simulation source missing ${v}`);
const walk=(dir:string):string[]=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
for(const file of [...walk('src'),...walk('scripts')].filter(f=>/\.(tsx?|mjs|cjs)$/.test(f))){
 const source=fs.readFileSync(file,'utf8');check(source.split('\n').length<300,`File too long: ${file}`);
 check(!/console\.log\(/.test(source),`console.log forbidden: ${file}`);
}
for(const [k,v] of Object.entries({...take.live,...take.receipts}))if(v==='TODO')pending.push(`Take value: ${k}`);
if(take.problem.quoteSource.startsWith('TODO')||take.problem.researchSource.startsWith('TODO'))pending.push('Primary URLs for problem quote and research claim');
if(!take.review.causalOrderApproved)pending.push('Actual footage causal-order review');
if(!take.review.visualReviewApproved)pending.push('Full audiovisual review');
if(!take.review.encodedMasterDecoded)pending.push('Encoded-master decode');
const mix=take.review;
if(mix.masterLufs===null||Math.abs(mix.masterLufs+14)>.5||mix.truePeakDbtp===null||mix.truePeakDbtp> -1||mix.voiceLufs===null||Math.abs(mix.voiceLufs+16)>.5)pending.push('VO −16 LUFS / master −14 LUFS / ≤ −1 dBTP final mix');
process.stdout.write(JSON.stringify({mode:delivery?'delivery':'assembly',checks,passed:checks-failures.length,failed:failures.length,failures,pending,unenforced:['The checks validate evidence presence; they do not independently attest receipts.','Continuous-motion quality needs visual review; source compilation is not acceptance.','Loudness targets are not measured until final voice and footage exist.']},null,2)+'\n');
if(failures.length||(delivery&&pending.length))process.exitCode=1;
