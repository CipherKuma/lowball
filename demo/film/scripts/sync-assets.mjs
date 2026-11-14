import {copyFileSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(readFileSync('src/data/assets.json','utf8'));
for(const asset of manifest){
 const source=`../../${asset.source}`;
 const bytes=readFileSync(source);
 copyFileSync(source,`public/${asset.public}`);
 asset.bytes=bytes.length;
 asset.sha256=createHash('sha256').update(bytes).digest('hex');
}
writeFileSync('src/data/assets.json','[\n'+manifest.map(a=>'  '+JSON.stringify(a)).join(',\n')+'\n]\n');
process.stdout.write(`Copied and hashed ${manifest.length} local assets; no symlinks.\n`);
