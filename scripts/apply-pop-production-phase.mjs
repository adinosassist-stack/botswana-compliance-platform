// Protected, single-phase schema executor. Never enables uploads or settles payments.
import {readFileSync} from 'node:fs';
import {qualifyPhase} from './qualify-pop-production-phase-offline.mjs';
const REPO='adinosassist-stack/botswana-compliance-platform';
const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
const DATABASE='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const ENVIRONMENT='pop-production-migration';
const ORIGINAL=['id','tenant_id','payment_order_id','submission_id','source','object_key','display_name','content_type','bytes','scan_status','received_by_user_id','uploaded_at','deleted_at'];
const ADDED=['content_sha256','object_etag','scan_request_id','scan_requested_at','scan_request_expires_at','scan_result_hash','scan_result_body','scan_result_signature','scanner_provider','scanned_at','last_owner_read_at','storage_deleted_at'];
const REQUEST=['document_id','tenant_id','payment_order_id','key_hash','request_hash','bytes','state','created_at'];
const need=(ok,reason)=>{if(!ok)throw Error('pop_production_hold_'+reason)};
const exact=(actual,expected)=>Array.isArray(actual)&&actual.length===expected.length&&expected.every(x=>actual.includes(x));
const DIGEST=/^[a-f0-9]{64}$/;

export async function applyPopProductionPhase(env,{request=fetch,read=readFileSync,now=()=>Date.now()}={}){
 need(env.GITHUB_REPOSITORY===REPO&&env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.GITHUB_REF==='refs/heads/main','dispatch');
 need(env.POP_CONFIRM==='APPLY_ONE_REVIEWED_POP_SCHEMA_PHASE','confirmation');
 need(/^[a-f0-9]{40}$/.test(env.EXPECTED_SHA||'')&&env.GITHUB_SHA===env.EXPECTED_SHA,'source');
 need(['070','071'].includes(env.POP_PHASE),'phase');
 need(env.POP_PRODUCTION_GITHUB_READ_TOKEN&&env.POP_PRODUCTION_CLOUDFLARE_TOKEN,'dedicated_credentials');
 need(/^[1-9][0-9]*$/.test(env.POP_OWNER_APPROVAL_ID||'')&&/^[1-9][0-9]*$/.test(env.POP_REVIEW_APPROVAL_ID||'')&&env.POP_OWNER_APPROVAL_ID!==env.POP_REVIEW_APPROVAL_ID,'approval_ids');
 async function call(url,token,body){
  let response;
  try{response=await request(url,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}catch{throw Error('pop_production_hold_provider_unavailable')}
  need(response.ok,'provider_http');
  try{return await response.json()}catch{throw Error('pop_production_hold_provider_json')}
 }
 const gh=path=>call('https://api.github.com/repos/'+REPO+'/'+path,env.POP_PRODUCTION_GITHUB_READ_TOKEN);
 const cf=(path,body)=>call('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+path,env.POP_PRODUCTION_CLOUDFLARE_TOKEN,body);
 async function query(sql){
  const r=await cf('/d1/database/'+DATABASE+'/query',{sql,params:[]});
  need(r.success===true&&r.result?.length===1&&r.result[0].success===true,'d1_response');
  return r.result[0];
 }
 async function inspect(){
  const catalog=await query("SELECT name,type FROM sqlite_master WHERE type IN ('table','index') ORDER BY name");
  need(catalog.meta?.rows_written===0,'readonly_inventory');
  const columns=async table=>{const r=await query('PRAGMA table_info('+table+')');need(r.meta?.rows_written===0,'readonly_columns');return r.results.map(x=>x.name)};
  return {tableNames:catalog.results.filter(x=>x.type==='table').map(x=>x.name),indexNames:catalog.results.filter(x=>x.type==='index').map(x=>x.name),documentColumnNames:await columns('payment_pop_documents'),requestColumnNames:await columns('payment_pop_upload_requests')};
 }
 async function relationships(requests=false){
  const tables=[['payment_pop_documents',[['tenant_id','tenants','CASCADE'],['payment_order_id','payment_orders','CASCADE'],['submission_id','manual_payment_submissions','SET NULL']]],...(requests?[['payment_pop_upload_requests',[['tenant_id','tenants','CASCADE'],['payment_order_id','payment_orders','CASCADE']]]]:[])];
  for(const [table,expected] of tables){
   const r=await query('PRAGMA foreign_key_list('+table+')');need(r.meta?.rows_written===0&&r.results.length===expected.length&&expected.every(([from,target,onDelete])=>r.results.some(x=>x.from===from&&x.table===target&&x.to==='id'&&x.on_delete===onDelete)),'schema_foreign_keys');
  }
 }
 async function authority(sqlSha256){
  const main=await gh('git/ref/heads/main');need(main.object?.sha===env.EXPECTED_SHA,'main_drift');
  const policy=await gh('environments/'+ENVIRONMENT);
  const reviewer=policy.protection_rules?.find(x=>x.type==='required_reviewers');
  need(policy.name===ENVIRONMENT&&policy.can_admins_bypass===false&&reviewer?.prevent_self_review===true&&reviewer.reviewers?.length===1&&reviewer.reviewers[0].type==='User'&&reviewer.reviewers[0].reviewer?.login==='thusico','environment_protection');
  need(policy.deployment_branch_policy?.custom_branch_policies===true&&policy.deployment_branch_policy?.protected_branches===false,'environment_branch_policy');
  const branches=await gh('environments/'+ENVIRONMENT+'/deployment-branch-policies');
  need(branches.total_count===1&&branches.branch_policies?.[0]?.name==='main'&&[undefined,'branch'].includes(branches.branch_policies[0].type),'environment_main_only');
  const proofs=[];
  for(const [id,author] of [[env.POP_OWNER_APPROVAL_ID,'adinosassist-stack'],[env.POP_REVIEW_APPROVAL_ID,'thusico']]){
   const c=await gh('issues/comments/'+id);
   need(String(c.id)===id&&c.user?.login===author&&c.issue_url==='https://api.github.com/repos/'+REPO+'/issues/1950','approval_identity');
   const marker='THEBE_POP_PRODUCTION_PHASE_APPROVAL\n';need(c.body?.startsWith(marker),'approval_marker');
   let p;try{p=JSON.parse(c.body.slice(marker.length))}catch{throw Error('pop_production_hold_approval_json')}
   const keys=['scope','phase','sourceSha','sqlSha256','accountId','databaseId','backupRunId','backupReceiptSha256','restoreRunId','recoveryAccepted','expiresAt'];
   need(p&&typeof p==='object'&&exact(Object.keys(p),keys),'approval_contract');
   need(p.scope==='ONE_POP_SCHEMA_PHASE_ONLY'&&p.phase===env.POP_PHASE&&p.sourceSha===env.EXPECTED_SHA&&p.sqlSha256===sqlSha256&&p.accountId===ACCOUNT&&p.databaseId===DATABASE,'approval_scope');
   const created=Date.parse(c.created_at),expires=Date.parse(p.expiresAt),time=now();
   need(Number.isFinite(created)&&created<=time&&time-created<=86400000&&expires>time&&expires<=created+86400000,'approval_expiry');
   need(p.recoveryAccepted===true&&DIGEST.test(p.backupReceiptSha256||'')&&/^[1-9][0-9]*$/.test(String(p.backupRunId))&&/^[1-9][0-9]*$/.test(String(p.restoreRunId)),'recovery_acceptance');
   proofs.push(p);
  }
  need(Object.keys(proofs[0]).every(k=>proofs[0][k]===proofs[1][k]),'approval_pair');
  const proof=proofs[0];
  const backup=await gh('actions/runs/'+proof.backupRunId),restore=await gh('actions/runs/'+proof.restoreRunId);
  for(const run of [backup,restore])need(run.repository?.full_name===REPO&&run.head_branch==='main'&&run.event==='workflow_dispatch'&&run.status==='completed'&&run.conclusion==='success','recovery_run');
  need(backup.path==='.github/workflows/private-production-backup-candidate.yml'&&backup.display_title==='Private backup candidate '+env.EXPECTED_SHA&&backup.head_sha===env.EXPECTED_SHA,'backup_run_scope');
  const backupAt=Date.parse(backup.updated_at);need(backupAt<=now()&&now()-backupAt<=120*60000,'backup_freshness');
  need(restore.path==='.github/workflows/isolated-operations-rehearsals.yml'&&restore.display_title==='Isolated operations RESTORE_APPROVED_BACKUP '+env.EXPECTED_SHA&&restore.head_sha===env.EXPECTED_SHA,'restore_run_scope');
  const settings=await cf('/workers/scripts/bw-compliance-os/settings');need(settings.success===true,'settings');
  for(const name of ['POP_UPLOAD_STAGING_ENABLED','EVIDENCE_UPLOADS_ENABLED','THEBE_AI_EXPORTS_ENABLED']){const b=settings.result?.bindings?.filter(x=>x.name===name);need(b?.length===1&&b[0].type==='plain_text'&&b[0].text==='false','feature_flags')}
  const identity=await cf('/d1/database/'+DATABASE);need(identity.success===true&&identity.result?.uuid===DATABASE&&identity.result?.name==='bw-compliance-os','database_identity');
  const finalMain=await gh('git/ref/heads/main');need(finalMain.object?.sha===env.EXPECTED_SHA,'main_drift');
  need(Date.parse(proof.expiresAt)>now(),'approval_expiry');
 }
 const input={phase:env.POP_PHASE,mainSha:env.GITHUB_SHA,expectedSha:env.EXPECTED_SHA,accountId:ACCOUNT,databaseId:DATABASE};
 // Qualification pins the exact migration bytes before provider access.
 const qualification=qualifyPhase({...input,tableNames:['tenants','payment_orders','manual_payment_submissions',...(env.POP_PHASE==='071'?['payment_pop_documents']:[])],indexNames:env.POP_PHASE==='071'?['payment_pop_documents_order_idx','payment_pop_documents_scan_idx']:[],documentColumnNames:env.POP_PHASE==='071'?ORIGINAL:[],requestColumnNames:[]},read);
 await authority(qualification.sqlSha256);
 qualifyPhase({...input,...await inspect()},read);
 for(const table of ['tenants','payment_orders','manual_payment_submissions']){
  const r=await query('PRAGMA table_info('+table+')');need(r.meta?.rows_written===0&&r.results.some(x=>x.name==='id'&&Number(x.pk)>0),'prerequisite_keys');
 }
 if(env.POP_PHASE==='071')await relationships();
 // Re-fetch both real authors and current main immediately before the sole write.
 const before=await inspect();qualifyPhase({...input,...before},read);
 await authority(qualification.sqlSha256);
 const applied=await cf('/d1/database/'+DATABASE+'/query',{sql:read(qualification.sqlPath,'utf8'),params:[]});
 need(applied.success===true&&Array.isArray(applied.result)&&applied.result.length>0&&applied.result.every(x=>x.success===true),'migration_response');
 const after=await inspect();
 if(env.POP_PHASE==='070')qualifyPhase({...input,phase:'071',...after},read);
 else need(exact(after.documentColumnNames,[...ORIGINAL,...ADDED])&&exact(after.requestColumnNames,REQUEST)&&['payment_pop_documents_order_idx','payment_pop_documents_scan_idx','payment_pop_upload_requests_tenant_idx'].every(x=>after.indexNames.includes(x)),'post_schema');
 await relationships(env.POP_PHASE==='071');
 for(const table of ['payment_pop_documents',...(env.POP_PHASE==='071'?['payment_pop_upload_requests']:[])]){
  const result=await query('PRAGMA foreign_key_check('+table+')');need(result.meta?.rows_written===0&&result.results.length===0,'post_foreign_keys');
 }
 return {kind:'pop_protected_schema_phase',sourceSha:env.EXPECTED_SHA,phase:env.POP_PHASE,sqlSha256:qualification.sqlSha256,migrationApplied:true,postSchemaVerified:true,popEnabled:false,subscriptionActivated:false};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 applyPopProductionPhase(process.env).then(r=>console.log(JSON.stringify(r))).catch(error=>{console.error(/^pop_(production_hold|phase_hold)_/.test(error?.message||'')?error.message:'pop_production_hold_unavailable');process.exitCode=1});
}
