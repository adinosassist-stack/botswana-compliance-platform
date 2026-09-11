import fs from 'node:fs';
import path from 'node:path';
import {sha256File} from './supply-chain-core.mjs';
import {validateProvenance} from './bf07-provenance-core.mjs';

function readJson(file,label){
  if(!fs.existsSync(file))throw new Error(`BF-07 release provenance missing: ${label}`);
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw new Error(`BF-07 release provenance is not valid JSON: ${label}`);}
}
function regularFile(file,label){
  if(!fs.existsSync(file))throw new Error(`BF-07 release provenance missing: ${label}`);
  const st=fs.lstatSync(file);
  if(st.isSymbolicLink()||!st.isFile())throw new Error(`BF-07 release provenance input must be a regular file: ${label}`);
}
function sameValue(a,b){
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  if(Array.isArray(a))return a.length===b.length&&a.every((v,i)=>sameValue(v,b[i]));
  const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();
  return ak.length===bk.length&&ak.every((k,i)=>k===bk[i]&&sameValue(a[k],b[k]));
}
function archivePaths(root,pkg){
  const zip=path.join(root,'dist',`THEBE_DESK_V81_RECOVERY_R1_${pkg.version.replaceAll('.','')}_RELEASE_SEALED.zip`);
  return {zip,sidecar:zip+'.sha256',output:path.join(root,'dist','bf07-verification','release-provenance.json')};
}
function verifySidecar(sidecar,zip){
  const raw=fs.readFileSync(sidecar,'utf8').trimEnd();
  const m=/^([0-9a-f]{64})  ([^/\r\n]+)$/.exec(raw);
  if(!m)throw new Error('BF-07 release SHA-256 sidecar format is invalid');
  const archiveSha256=sha256File(zip);
  if(m[1]!==archiveSha256)throw new Error('BF-07 release SHA-256 sidecar does not match the sealed archive');
  if(m[2]!==path.basename(zip))throw new Error('BF-07 release SHA-256 sidecar names the wrong archive');
  return archiveSha256;
}
function verifiedHash(env,name,label){
  const value=String(env[name]||'');
  if(!/^[0-9a-f]{64}$/.test(value))throw new Error(`BF-07 release provenance requires the independently verified ${label} SHA-256`);
  return value;
}

export function buildReleaseProvenance(root,env=process.env){
  const pkg=readJson(path.join(root,'package.json'),'package.json');
  const embedded=validateProvenance(root,env);
  const {zip,sidecar}=archivePaths(root,pkg);
  for(const [file,label] of [[path.join(root,'bf07-evidence.json'),'bf07-evidence.json'],[path.join(root,'bf07-provenance.json'),'bf07-provenance.json'],[zip,path.basename(zip)],[sidecar,path.basename(sidecar)]])regularFile(file,label);
  const sealedArchiveSha256=verifySidecar(sidecar,zip);
  const sealedSidecarSha256=sha256File(sidecar);
  const verifiedArchiveSha256=verifiedHash(env,'BF07_VERIFIED_ARCHIVE_SHA256','sealed archive');
  const verifiedSidecarSha256=verifiedHash(env,'BF07_VERIFIED_SIDECAR_SHA256','release sidecar');
  if(sealedArchiveSha256!==verifiedArchiveSha256)throw new Error('BF-07 sealed archive does not match independently verified archive hash');
  if(sealedSidecarSha256!==verifiedSidecarSha256)throw new Error('BF-07 release sidecar does not match independently verified sidecar hash');
  return {
    schemaVersion:1,
    package:{name:pkg.name,version:pkg.version},
    provider:embedded.provider,
    source:embedded.source,
    exactArchiveVerified:true,
    evidenceSha256:sha256File(path.join(root,'bf07-evidence.json')),
    embeddedProvenanceSha256:sha256File(path.join(root,'bf07-provenance.json')),
    policySha256:embedded.policySha256,
    sealedArchiveSha256,
    sealedSidecarSha256
  };
}

export function validateReleaseProvenance(root,env=process.env){
  const pkg=readJson(path.join(root,'package.json'),'package.json');
  const {output}=archivePaths(root,pkg);
  regularFile(output,'dist/bf07-verification/release-provenance.json');
  const actual=readJson(output,'dist/bf07-verification/release-provenance.json');
  const expected=buildReleaseProvenance(root,env);
  if(!sameValue(actual,expected))throw new Error('BF-07 release provenance is stale, replayed, incomplete, or tampered');
  return actual;
}
