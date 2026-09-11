import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateLockAndBuildSbom} from '../scripts/supply-chain-core.mjs';
import {BF07_POLICY_FILES,buildEvidenceManifest,validateEvidence} from '../scripts/bf07-evidence-core.mjs';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bf07-fixture-'));
const b64=n=>Buffer.alloc(64,n).toString('base64');
function seed(root){
  fs.mkdirSync(root,{recursive:true});
  fs.writeFileSync(path.join(root,'.nvmrc'),'22.23.2\n');
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'fixture',version:'1.0.0',private:true,packageManager:'npm@10.9.2',dependencies:{dep:'1.0.0'},devDependencies:{dev:'2.0.0'}},null,2)+'\n');
  for(const rel of BF07_POLICY_FILES){const f=path.join(root,rel);if(fs.existsSync(f))continue;fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,`fixture policy ${rel}\n`);}
  const lock={name:'fixture',version:'1.0.0',lockfileVersion:3,requires:true,packages:{'':{name:'fixture',version:'1.0.0',dependencies:{dep:'1.0.0'},devDependencies:{dev:'2.0.0'}},'node_modules/dep':{version:'1.0.0',resolved:'https://registry.npmjs.org/dep/-/dep-1.0.0.tgz',integrity:`sha512-${b64(1)}`,license:'MIT'},'node_modules/dev':{version:'2.0.0',resolved:'https://registry.npmjs.org/dev/-/dev-2.0.0.tgz',integrity:`sha512-${b64(2)}`,dev:true,license:'Apache-2.0'}}};
  fs.writeFileSync(path.join(root,'package-lock.json'),JSON.stringify(lock,null,2)+'\n');
  const built=validateLockAndBuildSbom(root);fs.writeFileSync(path.join(root,'sbom.cdx.json'),built.serialized);
  const audit={auditReportVersion:2,vulnerabilities:{},metadata:{vulnerabilities:{info:0,low:2,moderate:1,high:0,critical:0,total:3},dependencies:{prod:1,dev:1,optional:0,peer:0,peerOptional:0,total:2}}};
  fs.writeFileSync(path.join(root,'audit-report.json'),JSON.stringify(audit,null,2)+'\n');
  const manifest=buildEvidenceManifest(root,{nodeVersion:'22.23.2',npmVersion:'10.9.2',registryLiveVerified:true,cleanCache:true,npmCiVerified:true});
  fs.writeFileSync(path.join(root,'bf07-evidence.json'),JSON.stringify(manifest,null,2)+'\n');
}
function clone(name){const d=path.join(tmp,name);fs.cpSync(path.join(tmp,'base'),d,{recursive:true});return d;}
function expectFail(name,mutate,match){const d=clone(name);mutate(d);let err='';try{validateEvidence(d);}catch(e){err=String(e.message||e)}if(!err.includes(match))throw new Error(`${name}: expected failure containing ${match}; got ${err||'PASS'}`);console.log('PASS',name);return 1;}
seed(path.join(tmp,'base'));
let pass=0;
const good=validateEvidence(path.join(tmp,'base'));if(good.counts.high!==0||good.counts.critical!==0||good.sbomComponents!==2)throw new Error('valid BF-07 fixture rejected');console.log('PASS valid bound evidence allows low/moderate audit findings under high policy');pass++;
pass+=expectFail('non-registry lock rejected',d=>{const p=path.join(d,'package-lock.json'),j=JSON.parse(fs.readFileSync(p));j.packages['node_modules/dep'].resolved='file:../dep';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')},'non-registry');
pass+=expectFail('tampered SBOM rejected',d=>fs.appendFileSync(path.join(d,'sbom.cdx.json'),' '),'SBOM');
pass+=expectFail('high vulnerability rejected',d=>{const p=path.join(d,'audit-report.json'),j=JSON.parse(fs.readFileSync(p));j.metadata.vulnerabilities.high=1;j.metadata.vulnerabilities.total=4;fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')},'audit policy failed');
pass+=expectFail('stale manifest hash rejected',d=>{const p=path.join(d,'bf07-evidence.json'),j=JSON.parse(fs.readFileSync(p));j.sha256.auditReport='0'.repeat(64);fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')},'dependency hash binding');
pass+=expectFail('wrong toolchain rejected',d=>{const p=path.join(d,'bf07-evidence.json'),j=JSON.parse(fs.readFileSync(p));j.toolchain.node='22.22.0';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')},'toolchain');
pass+=expectFail('offline-style evidence rejected',d=>{const p=path.join(d,'bf07-evidence.json'),j=JSON.parse(fs.readFileSync(p));j.generation.registryLiveVerified=false;fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')},'clean online resolution');
pass+=expectFail('missing audit evidence rejected',d=>fs.unlinkSync(path.join(d,'audit-report.json')),'audit-report.json');
fs.rmSync(tmp,{recursive:true,force:true});
console.log(`V78 1.21.99 BF-07 evidence runtime: ${pass}/${pass} PASS`);
