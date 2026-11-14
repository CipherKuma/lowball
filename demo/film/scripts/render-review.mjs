import {bundle} from '@remotion/bundler';
import {openBrowser,renderStill,selectComposition} from '@remotion/renderer';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const frames=process.argv.slice(2).map(Number);
if(!frames.length||frames.some(f=>!Number.isInteger(f)||f<0||f>=4050))throw new Error('Supply frames from 0 to 4049');
const disk=spawnSync('/Users/gabrielantonyxaviour/.agents/bin/disk-check',[],{stdio:'inherit'});
if(disk.status!==0)process.exit(disk.status??1);
mkdirSync('review',{recursive:true});
const serveUrl=await bundle({entryPoint:resolve('src/index.ts'),outDir:resolve('build/review')});
const browser=await openBrowser('chrome',{browserExecutable:resolve('.cache/chrome-headless-shell-mac-arm64/chrome-headless-shell')});
try{
 const inputProps={audio:false,showGuide:true};
 const composition=await selectComposition({serveUrl,id:'Lowball',inputProps,puppeteerInstance:browser});
 for(const frame of frames){
  const output=resolve(`review/f${String(frame).padStart(5,'0')}.png`);
  await renderStill({serveUrl,composition,frame,output,inputProps,puppeteerInstance:browser,logLevel:'error'});
  process.stdout.write(`Rendered ${frame}: ${output}\n`);
 }
 writeFileSync('review/render-run.json',JSON.stringify({frames,renderedAt:new Date().toISOString()},null,2));
}finally{await browser.close({silent:true});}
