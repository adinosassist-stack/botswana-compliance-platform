import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const tags=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)];
const executable=[];let structured=0;
for(const [,attrsRaw,bodyRaw] of tags){
  const attrs=String(attrsRaw||''); const body=String(bodyRaw||'').trim(); if(!body)continue;
  const type=(attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)||[])[1]?.toLowerCase()||'';
  if(type==='application/ld+json'){
    try{JSON.parse(body);structured++;}catch(e){throw new Error(`Structured data JSON-LD syntax failed: ${e.message}`)}
    continue;
  }
  if(type&&type!=='text/javascript'&&type!=='application/javascript'&&type!=='module')continue;
  executable.push(body);
}
if(!executable.length)throw new Error('No inline frontend script found');
const tmp=path.join(os.tmpdir(),`bwcos-frontend-${process.pid}.mjs`);
fs.writeFileSync(tmp,executable.join('\n'));
const r=spawnSync(process.execPath,['--check',tmp],{encoding:'utf8'});
fs.unlinkSync(tmp);
if(r.status!==0)throw new Error(`Frontend JS syntax failed:\n${r.stderr||r.stdout}`);
console.log(`Frontend JavaScript syntax passed${structured?` · JSON-LD ${structured} validated`:''}`);
