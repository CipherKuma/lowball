import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
mkdirSync('review',{recursive:true});
const frames=process.argv.slice(2).map(Number);
if(!frames.length)frames.push(90,330,420,540,680,770,1010,1380,1450,1500,1700,2260,2370,2820,3060,3450,3620,3710,3900);
for(const frame of frames){
 if(!Number.isInteger(frame)||frame<0||frame>=4050)throw new Error(`Invalid frame ${frame}`);
 const disk=spawnSync(`${homedir()}/.agents/bin/disk-check`,[],{stdio:'inherit'});
 if(disk.status!==0)process.exit(disk.status??1);
 const args=['remotion','still','src/index.ts','Lowball',`review/f${String(frame).padStart(5,'0')}.png`,`--frame=${frame}`];
 const cached='.cache/chrome-headless-shell-mac-arm64/chrome-headless-shell';
 const browser=process.env.REMOTION_BROWSER_EXECUTABLE||(existsSync(cached)?cached:null);
 if(browser)args.push(`--browser-executable=${browser}`);
 const result=spawnSync('npx',args,{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status??1);
}
