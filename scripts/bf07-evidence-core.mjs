import fs from 'node:fs';
import path from 'node:path';
import {sha256Bytes,sha256File,validateLockAndBuildSbom} from './supply-chain-core.mjs';

export const BF07_REGISTRY='https://registry.npmjs.org/';
export const BF07_POLICY_FILES=[
  '.nvmrc','.npmrc','package.json',
  '.github/workflows/bf07-seal.yml',
  'scripts/supply-chain-core.mjs','scripts/supply-chain-gate.mjs','scripts/bf07-toolchain-core.mjs','scripts/bf07-toolchain-gate.mjs',
  'scripts/bf07-evidence-core.mjs','scripts/write-bf07-evidence.mjs','scripts/bf07-evidence-gate.mjs',
  'scripts/bf07-provenance-core.mjs','scripts/write-bf07-provenance.mjs','scripts/bf07-provenance-gate.mjs',
  'scripts/bf07-release-provenance-core.mjs','scripts/write-bf07-release-provenance.mjs','scripts/bf07-release-provenance-gate.mjs',
  'scripts/resolve-bf07.sh','scripts/dependency-audit.mjs','scripts/launch-gate.mjs','scripts/package-release.mjs','scripts/artifact-boundary-gate.mjs'
];

function readJson(file,label){
  if(!fs.existsSync(file))throw new Error(`BF-07 evidence missing: ${label}`);
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw new Error(`BF-07 evidence is not valid JSON: ${label}`);}
}
function auditCounts(report){
  if(report?.error)throw new Error(`npm audit report contains an error: ${report.error.summary||report.error.code||'unknown audit error'}`);
  const v=report?.metadata?.vulnerabilities;
  if(!v||typeof v!=='object')throw new Error('npm audit report is missing metadata.vulnerabilities');
  const counts={info:Number(v.info||0),low:Number(v.low||0),moderate:Number(v.moderate||0),high:Number(v.high||0),critical:Number(v.critical||0),total:Number(v.total||0)};
  for(const [k,n] of Object.entries(counts))if(!Number.isFinite(n)||n<0)throw new Error(`npm audit report has invalid ${k} count`);
  if(counts.high!==0||counts.critical!==0)throw new Error(`BF-07 audit policy failed: high=${counts.high}, critical=${counts.critical}`);
  return counts;
}
function policyHashes(root){
  const out={};
  for(const rel of BF07_POLICY_FILES){
    const f=path.join(root,rel);if(!fs.existsSync(f))throw new Error(`BF-07 policy source missing: ${rel}`);
    const st=fs.lstatSync(f);if(!st.isFile()||st.isSymbolicLink())throw new Error(`BF-07 policy source must be a regular file: ${rel}`);
    out[rel]=sha256File(f);
  }
  return out;
}
function sameRecord(a,b){
  const ak=Object.keys(a||{}).sort(),bk=Object.keys(b||{}).sort();
  return ak.length===bk.length&&ak.every((k,i)=>k===bk[i]&&a[k]===b[k]);
}

export function buildEvidenceManifest(root,{nodeVersion,npmVersion,registryLiveVerified=false,cleanCache=false,npmCiVerified=false}={}){
  const pkg=readJson(path.join(root,'package.json'),'package.json');
  const lockPath=path.join(root,'package-lock.json'),sbomPath=path.join(root,'sbom.cdx.json'),auditPath=path.join(root,'audit-report.json');
  const expected=validateLockAndBuildSbom(root);
  if(!fs.existsSync(sbomPath))throw new Error('BF-07 evidence missing: sbom.cdx.json');
  if(fs.readFileSync(sbomPath,'utf8')!==expected.serialized)throw new Error('sbom.cdx.json is stale or does not exactly match package-lock.json');
  const audit=readJson(auditPath,'audit-report.json'),counts=auditCounts(audit);
  const expectedNode=fs.readFileSync(path.join(root,'.nvmrc'),'utf8').trim().replace(/^v/,'');
  const expectedNpm=String(pkg.packageManager||'').replace(/^npm@/,'');
  if(!nodeVersion||nodeVersion!==expectedNode)throw new Error(`BF-07 evidence must use pinned Node ${expectedNode||'(missing .nvmrc)'}`);
  if(!npmVersion||npmVersion!==expectedNpm)throw new Error(`BF-07 evidence must use pinned npm ${expectedNpm||'(missing packageManager)'}`);
  if(!registryLiveVerified||!cleanCache||!npmCiVerified)throw new Error('BF-07 clean online resolution attestations are incomplete');
  return {
    schemaVersion:2,
    package:{name:pkg.name,version:pkg.version},
    toolchain:{node:nodeVersion,npm:npmVersion},
    registry:BF07_REGISTRY,
    generation:{isolatedEmptyCache:true,registryLiveVerified:true,preferOnline:true,offline:false,ignoreLifecycleScripts:true,npmCiVerified:true},
    sha256:{packageLock:sha256File(lockPath),sbom:sha256File(sbomPath),auditReport:sha256File(auditPath),policy:policyHashes(root)},
    auditPolicy:{omit:'dev',auditLevel:'high',high:counts.high,critical:counts.critical}
  };
}

export function validateEvidence(root){
  const manifestPath=path.join(root,'bf07-evidence.json');
  const manifest=readJson(manifestPath,'bf07-evidence.json');
  const pkg=readJson(path.join(root,'package.json'),'package.json');
  const lockPath=path.join(root,'package-lock.json'),sbomPath=path.join(root,'sbom.cdx.json'),auditPath=path.join(root,'audit-report.json');
  const expected=validateLockAndBuildSbom(root);
  if(!fs.existsSync(sbomPath)||fs.readFileSync(sbomPath,'utf8')!==expected.serialized)throw new Error('BF-07 deterministic SBOM does not exactly match the current lockfile');
  const audit=readJson(auditPath,'audit-report.json'),counts=auditCounts(audit);
  const nodePinned=fs.readFileSync(path.join(root,'.nvmrc'),'utf8').trim().replace(/^v/,'');
  const npmPinned=String(pkg.packageManager||'').replace(/^npm@/,'');
  if(manifest.schemaVersion!==2)throw new Error('Unsupported BF-07 evidence schema');
  if(manifest.package?.name!==pkg.name||manifest.package?.version!==pkg.version)throw new Error('BF-07 evidence package identity is stale');
  if(manifest.toolchain?.node!==nodePinned||manifest.toolchain?.npm!==npmPinned)throw new Error('BF-07 evidence toolchain does not match pinned project toolchain');
  if(manifest.registry!==BF07_REGISTRY)throw new Error('BF-07 evidence registry is not the canonical npm registry');
  const g=manifest.generation||{};
  if(g.isolatedEmptyCache!==true||g.registryLiveVerified!==true||g.preferOnline!==true||g.offline!==false||g.ignoreLifecycleScripts!==true||g.npmCiVerified!==true)throw new Error('BF-07 evidence does not attest the required clean online resolution path');
  const hashes=manifest.sha256||{};
  if(hashes.packageLock!==sha256File(lockPath)||hashes.sbom!==sha256File(sbomPath)||hashes.auditReport!==sha256File(auditPath))throw new Error('BF-07 evidence dependency hash binding is stale or tampered');
  const currentPolicy=policyHashes(root);
  if(!sameRecord(hashes.policy,currentPolicy))throw new Error('BF-07 evidence policy-source hash binding is stale or tampered');
  const policy=manifest.auditPolicy||{};
  if(policy.omit!=='dev'||policy.auditLevel!=='high'||Number(policy.high)!==counts.high||Number(policy.critical)!==counts.critical)throw new Error('BF-07 audit policy metadata does not match audit-report.json');
  return {manifest,counts,lockSha256:sha256Bytes(expected.rawLock),sbomComponents:expected.components.length,policyHashes:currentPolicy};
}
