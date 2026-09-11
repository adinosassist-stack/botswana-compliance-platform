import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pinnedToolchain,validateToolchain} from '../scripts/bf07-toolchain-core.mjs';
let pass=0;const ok=(c,m)=>{if(!c)throw new Error('FAIL: '+m);pass++;console.log('PASS',m)};
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bf07-toolchain-'));
try{
  fs.writeFileSync(path.join(root,'.nvmrc'),'22.23.2\n');
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'fixture',version:'1.0.0',packageManager:'npm@10.9.8'}));
  const pinned=pinnedToolchain(root);ok(pinned.node==='22.23.2'&&pinned.npm==='10.9.8','exact pins parse');
  ok(validateToolchain(root,{nodeVersion:'22.23.2',npmVersion:'10.9.8'}).npm==='10.9.8','exact Node/npm pair accepted');
  try{validateToolchain(root,{nodeVersion:'22.23.1',npmVersion:'10.9.8'});ok(false,'wrong Node rejected')}catch(e){ok(/Node 22\.23\.1; expected 22\.23\.2/.test(e.message),'wrong Node rejected')}
  try{validateToolchain(root,{nodeVersion:'22.23.2',npmVersion:'10.9.2'});ok(false,'wrong npm rejected')}catch(e){ok(/npm 10\.9\.2; expected 10\.9\.8/.test(e.message),'wrong npm rejected')}
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'fixture',version:'1.0.0',packageManager:'npm@latest'}));
  try{pinnedToolchain(root);ok(false,'floating npm declaration rejected')}catch(e){ok(/declaration is incomplete/.test(e.message),'floating npm declaration rejected')}
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'fixture',version:'1.0.0',packageManager:'pnpm@10.0.0'}));
  try{pinnedToolchain(root);ok(false,'wrong package manager rejected')}catch(e){ok(/declaration is incomplete/.test(e.message),'wrong package manager rejected')}
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'fixture',version:'1.0.0',packageManager:'npm@10.9.8'}));
  fs.writeFileSync(path.join(root,'.nvmrc'),'22.x\n');
  try{pinnedToolchain(root);ok(false,'floating Node declaration rejected')}catch(e){ok(/declaration is incomplete/.test(e.message),'floating Node declaration rejected')}
} finally {fs.rmSync(root,{recursive:true,force:true});}
console.log(`V78 1.21.101 BF-07 toolchain runtime: ${pass}/${pass} PASS`);
