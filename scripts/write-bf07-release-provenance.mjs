import fs from 'node:fs';
import path from 'node:path';
import {buildReleaseProvenance} from './bf07-release-provenance-core.mjs';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const out=path.join(root,'dist','bf07-verification','release-provenance.json');
const tmp=`${out}.tmp-${process.pid}`;
const release=buildReleaseProvenance(root);
fs.mkdirSync(path.dirname(out),{recursive:true});
try{
  fs.writeFileSync(tmp,JSON.stringify(release,null,2)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
  fs.renameSync(tmp,out);
}finally{
  fs.rmSync(tmp,{force:true});
}
console.log(`BF-07 exact-archive release provenance written: ${out}`);
