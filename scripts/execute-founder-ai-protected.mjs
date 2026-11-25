import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setFounderAiEntitlement} from './founder-ai-entitlement.mjs';
import {checkLaunchProvenance} from './check-launch-provenance-readonly.mjs';
const REPO='adinosassist-stack/botswana-compliance-platform';
const SHA=/^[a-f0-9]{40}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export async function verifyAuthority(env,fetchImpl=fetch){
  assert(env.GITHUB_REPOSITORY===REPO&&env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_ACTOR==='adinosassist-stack'&&env.GITHUB_TRIGGERING_ACTOR==='adinosassist-stack','founder_context_denied');
  const sha=env.EXPECTED_SHA;
  assert(SHA.test(sha||'')&&env.GITHUB_SHA===sha&&/^\d+$/.test(env.GITHUB_RUN_ID||'')&&env.GH_TOKEN,'founder_context_denied');
  const get=async path=>{
    const res=await fetchImpl('https://api.github.com/repos/'+REPO+'/'+path,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+env.GH_TOKEN,accept:'application/vnd.github+json'}});
    assert(res.ok,'founder_authority_unavailable');return res.json();
  };
  assert((await get('branches/main')).commit.sha===sha,'founder_stale_main');
  const commit=await get('commits/'+sha);
  const prs=(await get('commits/'+sha+'/pulls?per_page=100')).filter(p=>p.merged_at&&p.merge_commit_sha===sha&&p.base?.ref==='main'&&p.head?.repo?.full_name===REPO);
  assert(commit.sha===sha&&commit.parents?.length===2&&prs.length===1&&prs[0].head.sha===commit.parents[1].sha,'founder_merge_required');
  const pr=prs[0];
  const reviews=(await get('pulls/'+pr.number+'/reviews?per_page=100')).filter(r=>r.user?.login==='thusico'&&['APPROVED','CHANGES_REQUESTED','DISMISSED'].includes(r.state)).sort((a,b)=>b.id-a.id);
  assert(reviews[0]?.state==='APPROVED'&&reviews[0].commit_id===pr.head.sha,'founder_review_required');
  for(const [workflow,head,event,branch] of [['independent-review-regressions.yml',pr.head.sha,'pull_request',pr.head.ref],['founder-ai-protected-activation.yml',pr.head.sha,'pull_request',pr.head.ref],['main-governance-guard.yml',sha,'push','main'],['recovery-ci.yml',sha,'push','main']]){
    const data=await get('actions/workflows/'+workflow+'/runs?head_sha='+head+'&event='+event+'&per_page=100');
    const runs=(data.workflow_runs||[]).filter(r=>r.head_sha===head&&r.head_branch===branch&&r.event===event&&r.head_repository?.full_name===REPO).sort((a,b)=>b.id-a.id);
    assert(runs[0]?.status==='completed'&&runs[0].conclusion==='success','founder_ci_required');
  }
  return true;
}
// BF-07 is a release-manifest seal, not an operations-only merge seal.
// Require the exact still-live release's seal, never a substitute from another release.
export async function verifyLiveReleaseSeal(env,{fetchImpl=fetch,git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim()}={}){
  const sha=env.EXPECTED_SHA;
  assert(SHA.test(sha||'')&&git('rev-parse','HEAD')===sha,'founder_checkout_mismatch');
  const releaseSha=git('log','--first-parent','-1','--format=%H',sha,'--','release/production.json');
  assert(SHA.test(releaseSha),'founder_release_seal_missing');
  const manifest=JSON.parse(git('show',releaseSha+':release/production.json'));
  const current=JSON.parse(git('show',sha+':release/production.json'));
  assert(JSON.stringify(manifest)===JSON.stringify(current),'founder_release_manifest_changed');
  // The deployed entitlement runtime and its reviewed grant helper must be unchanged.
  for(const path of ['cloudflare/src/founder-ai-entitlement.js','scripts/founder-ai-entitlement.mjs']){
    assert(git('rev-parse',releaseSha+':'+path)===git('rev-parse',sha+':'+path),'founder_release_entitlement_changed');
  }
  const get=async path=>{
    const r=await fetchImpl('https://api.github.com/repos/'+REPO+'/'+path,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+env.GH_TOKEN,accept:'application/vnd.github+json'}});
    assert(r.ok,'founder_seal_unavailable');return r.json();
  };
  const runs=(await get('actions/workflows/bf07-seal.yml/runs?head_sha='+releaseSha+'&event=push&per_page=100')).workflow_runs||[];
  const run=runs.filter(r=>r.head_sha===releaseSha&&r.head_branch==='main'&&r.event==='push'&&r.head_repository?.full_name===REPO).sort((a,b)=>b.id-a.id)[0];
  assert(run?.status==='completed'&&run.conclusion==='success','founder_release_seal_missing');
  const artifacts=(await get('actions/runs/'+run.id+'/artifacts?per_page=100')).artifacts||[];
  assert(artifacts.some(a=>a.name==='bf07-sealed-'+releaseSha&&a.expired===false&&Date.parse(a.expires_at)>Date.now()&&/^sha256:[a-f0-9]{64}$/.test(a.digest||'')),'founder_release_seal_artifact_missing');
  assert((await checkLaunchProvenance(manifest,{fetchImpl})).ok,'founder_live_release_mismatch');
  return {releaseSha,runId:run.id};
}
export function createD1Adapter(query){
  const make=(sql,params=[])=>({sql,params,bind(...values){return make(sql,values)},async first(){const [r]=await query([{sql,params}]);return r.results[0]??null}});
  return {prepare:sql=>make(sql),batch:statements=>query(statements.map(({sql,params})=>({sql,params})))};
}
export async function runBoundedOperation(db,identity,{mode,approvalReference,recheck}){
  assert(['inspect','grant','revoke'].includes(mode),'founder_mode_invalid');
  const {email,userId,tenantId}=identity;
  assert(typeof email==='string'&&email.includes('@')&&typeof userId==='string'&&userId.length>0&&typeof tenantId==='string'&&tenantId.length>0,'founder_identity_invalid');
  const match=await db.prepare("SELECT COUNT(*) n FROM users u JOIN memberships m ON m.user_id=u.id AND m.role='owner' AND m.status='active' WHERE lower(trim(u.email))=lower(trim(?) )").bind(email).first();
  assert(Number(match?.n)===1,'founder_identity_ambiguous');
  const options={email,userId,tenantId,enabled:mode!=='revoke',approvalReference,inspectOnly:true};
  const before=await setFounderAiEntitlement(db,options);
  if(mode==='inspect')return {mode,enabled:before.enabled};
  const snapshot=async()=>({
    wallet:await db.prepare('SELECT balance,lifetime_used FROM ai_credit_wallets WHERE tenant_id=?').bind(tenantId).first(),
    orders:await db.prepare('SELECT COUNT(*) n FROM ai_credit_orders WHERE tenant_id=?').bind(tenantId).first()
  });
  const balances=await snapshot();
  await recheck();
  const result=await setFounderAiEntitlement(db,{...options,inspectOnly:false});
  const after=await snapshot();
  return {mode,enabled:result.enabled,verified:result.verified===true||result.mode==='unchanged',walletAndOrderCountUnchanged:JSON.stringify(balances)===JSON.stringify(after)};
}
export async function execute(env=process.env,fetchImpl=fetch){
  await verifyAuthority(env,fetchImpl);
  assert(['inspect','grant','revoke'].includes(env.MODE),'founder_mode_invalid');
  assert(/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID||'')&&UUID.test(env.D1_DATABASE_ID||'')&&env.CLOUDFLARE_API_TOKEN,'founder_target_invalid');
  const identity=JSON.parse(env.FOUNDER_AI_IDENTITY_JSON||'{}');
  const manifest=JSON.parse(readFileSync(new URL('../release/production.json',import.meta.url),'utf8'));
  const recheck=async()=>{await verifyAuthority(env,fetchImpl);await verifyLiveReleaseSeal(env,{fetchImpl});assert((await checkLaunchProvenance(manifest,{fetchImpl})).ok,'founder_live_release_mismatch')};
  await recheck();
  const base='https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+env.D1_DATABASE_ID;
  const api=async(suffix,options={})=>{
    const r=await fetchImpl(base+suffix,{...options,redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,accept:'application/json','content-type':'application/json'}});
    assert(r.ok,'founder_d1_unavailable');const b=await r.json();assert(b.success===true,'founder_d1_unavailable');return b.result;
  };
  const info=await api('');
  assert(info.uuid===env.D1_DATABASE_ID&&info.name==='bw-compliance-os','founder_target_mismatch');
  const db=createD1Adapter(async batch=>{
    const results=await api('/query',{method:'POST',body:JSON.stringify({batch})});
    assert(Array.isArray(results)&&results.length===batch.length&&results.every(r=>r.success===true&&Array.isArray(r.results)),'founder_d1_query_failed');
    return results;
  });
  return runBoundedOperation(db,identity,{mode:env.MODE,approvalReference:'https://github.com/'+REPO+'/actions/runs/'+env.GITHUB_RUN_ID,recheck});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{const result=await execute();console.log(JSON.stringify(result));if(result.walletAndOrderCountUnchanged===false)process.exitCode=1}
  catch(error){console.error(/^founder_[a-z_]+$/.test(error.message)?error.message:'founder_operation_failed_inspect_before_retry');process.exitCode=1}
}
