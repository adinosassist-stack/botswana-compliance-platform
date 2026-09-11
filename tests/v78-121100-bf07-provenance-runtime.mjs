import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateLockAndBuildSbom} from '../scripts/supply-chain-core.mjs';
import {BF07_POLICY_FILES,buildEvidenceManifest} from '../scripts/bf07-evidence-core.mjs';
import {buildProvenance,validateProvenance} from '../scripts/bf07-provenance-core.mjs';
import {buildReleaseProvenance,validateReleaseProvenance} from '../scripts/bf07-release-provenance-core.mjs';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bf07-prov-fixture-'));
const b64=n=>Buffer.alloc(64,n).toString('base64');
const githubEnv={GITHUB_ACTIONS:'true',GITHUB_SHA:'a'.repeat(40),GITHUB_REPOSITORY:'owner/repo',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1'};
const h=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function zipPath(root){return path.join(root,'dist','THEBE_DESK_V81_RECOVERY_R1_100_RELEASE_SEALED.zip');}
function releaseEnv(root){const zip=zipPath(root),sidecar=zip+'.sha256';return {...githubEnv,BF07_VERIFIED_ARCHIVE_SHA256:h(zip),BF07_VERIFIED_SIDECAR_SHA256:h(sidecar)};}
function seed(root){
  fs.mkdirSync(root,{recursive:true});
  fs.writeFileSync(path.join(root,'.nvmrc'),'22.23.2\n');
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'fixture',version:'1.0.0',private:true,packageManager:'npm@10.9.2',dependencies:{dep:'1.0.0'},devDependencies:{}},null,2)+'\n');
  for(const rel of BF07_POLICY_FILES){const f=path.join(root,rel);if(fs.existsSync(f))continue;fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,`fixture policy ${rel}\n`);}
  const lock={name:'fixture',version:'1.0.0',lockfileVersion:3,requires:true,packages:{'':{name:'fixture',version:'1.0.0',dependencies:{dep:'1.0.0'},devDependencies:{}},'node_modules/dep':{version:'1.0.0',resolved:'https://registry.npmjs.org/dep/-/dep-1.0.0.tgz',integrity:`sha512-${b64(1)}`,license:'MIT'}}};
  fs.writeFileSync(path.join(root,'package-lock.json'),JSON.stringify(lock,null,2)+'\n');
  fs.writeFileSync(path.join(root,'sbom.cdx.json'),validateLockAndBuildSbom(root).serialized);
  fs.writeFileSync(path.join(root,'audit-report.json'),JSON.stringify({auditReportVersion:2,vulnerabilities:{},metadata:{vulnerabilities:{info:0,low:0,moderate:0,high:0,critical:0,total:0}}},null,2)+'\n');
  const e=buildEvidenceManifest(root,{nodeVersion:'22.23.2',npmVersion:'10.9.2',registryLiveVerified:true,cleanCache:true,npmCiVerified:true});
  fs.writeFileSync(path.join(root,'bf07-evidence.json'),JSON.stringify(e,null,2)+'\n');
  fs.writeFileSync(path.join(root,'bf07-provenance.json'),JSON.stringify(buildProvenance(root,githubEnv),null,2)+'\n');
  const zip=zipPath(root);
  fs.mkdirSync(path.dirname(zip),{recursive:true});fs.writeFileSync(zip,'fixture sealed archive\n');
  fs.writeFileSync(zip+'.sha256',`${h(zip)}  ${path.basename(zip)}\n`);
  const release=buildReleaseProvenance(root,releaseEnv(root)),out=path.join(root,'dist','bf07-verification','release-provenance.json');
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(release,null,2)+'\n');
}
function clone(n){const d=path.join(tmp,n);fs.cpSync(path.join(tmp,'base'),d,{recursive:true});return d;}
function fail(n,mutate,needle){const d=clone(n);mutate(d);let got='';try{validateProvenance(d,{});}catch(e){got=String(e.message||e)}if(!got.includes(needle))throw new Error(`${n}: expected ${needle}; got ${got||'PASS'}`);console.log('PASS',n);return 1;}
function failRelease(n,mutate,needle){const d=clone(n),env=releaseEnv(d);mutate(d);let got='';try{validateReleaseProvenance(d,env);}catch(e){got=String(e.message||e)}if(!got.includes(needle))throw new Error(`${n}: expected ${needle}; got ${got||'PASS'}`);console.log('PASS',n);return 1;}
seed(path.join(tmp,'base'));let pass=0;
const good=validateProvenance(path.join(tmp,'base'),{});if(good.provider!=='github-actions'||good.source.commit!=='a'.repeat(40))throw new Error('valid GitHub provenance rejected');console.log('PASS valid GitHub provenance accepted');pass++;
validateProvenance(path.join(tmp,'base'),githubEnv);console.log('PASS current GitHub execution context accepted');pass++;
let replay='';try{validateProvenance(path.join(tmp,'base'),{...githubEnv,GITHUB_SHA:'b'.repeat(40)});}catch(e){replay=String(e.message||e)}if(!replay.includes('current GitHub execution context'))throw new Error(`cross-run provenance replay was not rejected: ${replay||'PASS'}`);console.log('PASS cross-run GitHub provenance replay rejected');pass++;
const releaseGood=validateReleaseProvenance(path.join(tmp,'base'),releaseEnv(path.join(tmp,'base')));if(releaseGood.sealedArchiveSha256!==h(zipPath(path.join(tmp,'base'))))throw new Error('valid release provenance rejected');console.log('PASS exact-archive release provenance accepted');pass++;
let unbound='';try{validateReleaseProvenance(path.join(tmp,'base'),githubEnv);}catch(e){unbound=String(e.message||e)}if(!unbound.includes('independently verified sealed archive SHA-256'))throw new Error(`release provenance accepted missing verifier hash binding: ${unbound||'PASS'}`);console.log('PASS release provenance without independent verifier hashes rejected');pass++;
pass+=fail('tampered policy source invalidates evidence provenance',d=>fs.appendFileSync(path.join(d,'scripts/resolve-bf07.sh'),'tamper'),'policy-source hash binding');
pass+=fail('tampered provenance evidence hash rejected',d=>{const p=path.join(d,'bf07-provenance.json'),j=JSON.parse(fs.readFileSync(p));j.evidenceSha256='0'.repeat(64);fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')},'provenance evidence hash');
pass+=fail('unapproved provider rejected',d=>{const p=path.join(d,'bf07-provenance.json'),j=JSON.parse(fs.readFileSync(p));j.provider='unknown';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')},'provider is not approved');
pass+=fail('incomplete GitHub context rejected',d=>{const p=path.join(d,'bf07-provenance.json'),j=JSON.parse(fs.readFileSync(p));j.source.commit='short';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')},'context is incomplete');
pass+=fail('wrong resolver identity rejected',d=>{const p=path.join(d,'bf07-provenance.json'),j=JSON.parse(fs.readFileSync(p));j.generation.resolver='other.sh';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')},'hardened resolver path');
pass+=failRelease('tampered final release provenance rejected',d=>{const p=path.join(d,'dist/bf07-verification/release-provenance.json'),j=JSON.parse(fs.readFileSync(p));j.sealedArchiveSha256='0'.repeat(64);fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')},'stale, replayed, incomplete, or tampered');
pass+=failRelease('tampered sealed archive rejected',d=>fs.appendFileSync(zipPath(d),'tamper'),'sidecar does not match the sealed archive');
pass+=failRelease('wrong sidecar archive name rejected',d=>{const zip=zipPath(d),p=zip+'.sha256',digest=fs.readFileSync(p,'utf8').split(/\s+/)[0];fs.writeFileSync(p,`${digest}  other.zip\n`)},'sidecar names the wrong archive');
pass+=failRelease('co-tampered archive and matching sidecar rejected',d=>{const zip=zipPath(d),sidecar=zip+'.sha256';fs.appendFileSync(zip,'coordinated tamper');fs.writeFileSync(sidecar,`${h(zip)}  ${path.basename(zip)}\n`)},'independently verified archive hash');
let err='';try{buildProvenance(path.join(tmp,'base'),{GITHUB_ACTIONS:'true',GITHUB_SHA:'bad',GITHUB_REPOSITORY:'owner/repo',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:'1',GITHUB_RUN_ATTEMPT:'1'});}catch(e){err=String(e.message||e)}if(!err.includes('40-character commit SHA'))throw new Error('build provenance accepted malformed GitHub SHA');console.log('PASS malformed GitHub SHA rejected at provenance creation');pass++;
fs.rmSync(tmp,{recursive:true,force:true});
console.log(`V78 1.21.100 BF-07 provenance runtime: ${pass}/${pass} PASS`);
