import fs from 'node:fs';
import path from 'node:path';
import {sha256File} from './supply-chain-core.mjs';
import {validateEvidence} from './bf07-evidence-core.mjs';

function readJson(file,label){
  if(!fs.existsSync(file))throw new Error(`BF-07 provenance missing: ${label}`);
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw new Error(`BF-07 provenance is not valid JSON: ${label}`);}
}
function fullSha(v){return /^[0-9a-f]{40}$/i.test(String(v||''));}
function positiveInteger(v){return /^[1-9]\d*$/.test(String(v||''));}
function sameRecord(a,b){const ak=Object.keys(a||{}).sort(),bk=Object.keys(b||{}).sort();return ak.length===bk.length&&ak.every((k,i)=>k===bk[i]&&a[k]===b[k]);}
function githubSource(env){
  return {repository:env.GITHUB_REPOSITORY||null,commit:env.GITHUB_SHA||null,ref:env.GITHUB_REF||null,runId:env.GITHUB_RUN_ID||null,runAttempt:env.GITHUB_RUN_ATTEMPT||null};
}
function expectedGithubSource(env){
  const source={
    repository:env.BF07_EXPECTED_REPOSITORY||null,
    commit:env.BF07_EXPECTED_SHA||null,
    ref:env.BF07_EXPECTED_REF||null,
    runId:env.BF07_EXPECTED_RUN_ID||null,
    runAttempt:env.BF07_EXPECTED_RUN_ATTEMPT||null
  };
  const values=Object.values(source);
  if(!values.some(Boolean))return null;
  if(values.some(v=>!v))throw new Error('Expected BF-07 producer provenance context is incomplete');
  if(!fullSha(source.commit))throw new Error('Expected BF-07 producer commit must be a full 40-character SHA');
  if(!positiveInteger(source.runId)||!positiveInteger(source.runAttempt))throw new Error('Expected BF-07 producer run identity is invalid');
  return source;
}

export function buildProvenance(root,env=process.env){
  const pkg=readJson(path.join(root,'package.json'),'package.json');
  const {manifest}=validateEvidence(root);
  const github=env.GITHUB_ACTIONS==='true';
  const provider=github?'github-actions':'manual-networked-run';
  if(github){
    if(!fullSha(env.GITHUB_SHA))throw new Error('GitHub BF-07 provenance requires a full 40-character commit SHA');
    if(!env.GITHUB_REPOSITORY||!env.GITHUB_REF||!env.GITHUB_RUN_ID||!env.GITHUB_RUN_ATTEMPT)throw new Error('GitHub BF-07 provenance context is incomplete');
  }
  return {
    schemaVersion:1,
    package:{name:pkg.name,version:pkg.version},
    provider,
    source:githubSource(env),
    generation:{resolver:'scripts/resolve-bf07.sh',cleanOnlineEvidence:true},
    evidenceSha256:sha256File(path.join(root,'bf07-evidence.json')),
    policySha256:manifest.sha256.policy
  };
}

export function validateProvenance(root,env=process.env){
  const p=readJson(path.join(root,'bf07-provenance.json'),'bf07-provenance.json');
  const pkg=readJson(path.join(root,'package.json'),'package.json');
  const {manifest}=validateEvidence(root);
  if(p.schemaVersion!==1)throw new Error('Unsupported BF-07 provenance schema');
  if(p.package?.name!==pkg.name||p.package?.version!==pkg.version)throw new Error('BF-07 provenance package identity is stale');
  if(!['github-actions','manual-networked-run'].includes(p.provider))throw new Error('BF-07 provenance provider is not approved');
  if(p.provider==='github-actions'){
    if(!fullSha(p.source?.commit)||!p.source?.repository||!p.source?.ref||!positiveInteger(p.source?.runId)||!positiveInteger(p.source?.runAttempt))throw new Error('GitHub BF-07 provenance context is incomplete');
  }
  if(env.GITHUB_ACTIONS==='true'){
    const expected=expectedGithubSource(env);
    if(expected){
      if(p.provider!=='github-actions'||!sameRecord(p.source,expected))throw new Error('BF-07 provenance does not match the exact qualified producer run');
    }else{
      const current=githubSource(env);
      if(!fullSha(current.commit)||!current.repository||!current.ref||!positiveInteger(current.runId)||!positiveInteger(current.runAttempt))throw new Error('Current GitHub BF-07 execution context is incomplete');
      if(p.provider!=='github-actions'||!sameRecord(p.source,current))throw new Error('BF-07 provenance does not match the current GitHub execution context');
    }
  }
  if(p.generation?.resolver!=='scripts/resolve-bf07.sh'||p.generation?.cleanOnlineEvidence!==true)throw new Error('BF-07 provenance does not identify the hardened resolver path');
  if(p.evidenceSha256!==sha256File(path.join(root,'bf07-evidence.json')))throw new Error('BF-07 provenance evidence hash is stale or tampered');
  if(!sameRecord(p.policySha256,manifest.sha256.policy))throw new Error('BF-07 provenance policy hashes do not match bound evidence');
  return p;
}
