/**
 * Corporate Assets isolated staging audit D1 repair, protected workflow runner.
 * Mode preflight-only uses only provider read SQL/GET; apply-approved is a
 * separate future owner-approved, thusico-protected DDL operation.
 * Never prints customer rows, tokens or the D1 Time Travel bookmark.
 */
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {buildAssetsAuditRepairReview} from './corporate-assets-staging-additive-audit-plan.mjs';
import {ASSETS_ISOLATED_DB_ID,ASSETS_ISOLATED_DB_NAME} from './corporate-assets-staging-offline-bootstrap-receipt.mjs';
import {validateEnvironmentPolicy} from './corporate-assets-protected-secret-candidate.mjs';
import {ASSET_STAGING_REQUIRED_COLUMNS,corporateAssetsStagingSchemaPreflight} from '../cloudflare/src/corporate-assets-staging-schema-preflight.js';

const REPO='adinosassist-stack/botswana-compliance-platform';
const GH='https://api.github.com/repos/'+REPO;
const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
const CF='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const D1=CF+'/d1/database/'+ASSETS_ISOLATED_DB_ID;
const WORKER=CF+'/workers/scripts/bw-corporate-assets-staging';
const SHA=/^[a-f0-9]{40}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const APPLY_AUTH='APPLY_ISOLATED_ASSETS_AUDIT_ADDITIVE_ONLY';
const APPROVAL_KIND='ASSETS_STAGING_D1_AUDIT_ADD_SCOPE_V1';
const COUNTS=Object.freeze(['tenants','users','memberships','sessions','corporate_assets','corporate_asset_services','audit_events','audit_chain_state','audit_write_failures','auth_rate_limits','corporate_assets_staging_identity']);
const requiredAbsent=Object.freeze(['table:audit_integrity_checks','index:audit_integrity_checks_tenant_idx','index:audit_write_failures_tenant_idx']);
const hash=s=>createHash('sha256').update(s).digest('hex');
const deny=reason=>{throw Error(reason)};
function assertContext(c){
 if(c.repository!==REPO||c.ref!=='refs/heads/main'||!SHA.test(c.expectedSha||'')||c.githubSha!==c.expectedSha)
  deny('protected_exact_main_required');
 if(!['preflight-only','apply-approved'].includes(c.mode))deny('unsupported_mode');
 if(c.actor==='thusico')deny('reviewer_cannot_initiate');
 if(c.mode==='apply-approved'){
  if(c.actor!=='adinosassist-stack'||c.authorization!==APPLY_AUTH||
     !/^[1-9][0-9]{5,18}$/.test(String(c.ownerCommentId||''))||
     !DIGEST.test(c.expectedSqlHash||'')||!DIGEST.test(c.expectedBookmarkHash||''))
    deny('specific_owner_write_scope_required');
 }else if(c.authorization!=='READ_ONLY_ASSETS_D1_PREFLIGHT')
  deny('readonly_authorization_required');
}
export function expectedOwnerApprovalText({sha,sqlHash,bookmarkHash}){
 if(!SHA.test(sha||'')||!DIGEST.test(sqlHash||'')||!DIGEST.test(bookmarkHash||''))
  deny('approval_digest_required');
 return [APPROVAL_KIND,
  'authorization='+APPLY_AUTH,
  'source_sha='+sha,
  'database_id='+ASSETS_ISOLATED_DB_ID,
  'sql_sha256='+sqlHash,
  'prechange_bookmark_sha256='+bookmarkHash,
  'writer_freeze=OWNER_ATTESTS_NO_OTHER_STAGING_D1_WRITERS',
  'scope=CREATE_AUDIT_INTEGRITY_TABLE_AND_TWO_INDEXES_ONLY',
  'customer_data_preservation=REQUIRED',
  'production_and_worker_changes=NOT_AUTHORIZED'].join('\n');
}
export function validateOwnerApproval(comment,{sha,sqlHash,bookmarkHash,commentId}){
 if(!comment||comment.id!==Number(commentId)||
    comment.user?.login!=='adinosassist-stack'||
    comment.issue_url!==GH+'/issues/2204'||
    comment.created_at!==comment.updated_at||
    comment.body?.trim()!==expectedOwnerApprovalText({sha,sqlHash,bookmarkHash}))
  deny('explicit_immutable_owner_issue_approval_required');
 return true;
}
async function jsonRequest(url,{token,method='GET',body,request=fetch,isGithub=false}={}){
 if(!token)deny('dedicated_protected_token_required');
 const res=await request(url,{method,redirect:'error',signal:AbortSignal.timeout(15000),
  headers:{authorization:'Bearer '+token,accept:isGithub?'application/vnd.github+json':'application/json',
   ...(isGithub?{'X-GitHub-Api-Version':'2022-11-28'}:{}),
   ...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
 if(!res.ok)deny(isGithub?'github_authority_read_failed':'d1_provider_request_failed');
 const data=await res.json();
 if(!data||typeof data!=='object')deny('protected_provider_response_invalid');
 return data;
}
async function cfGet(path,token,request){
 const data=await jsonRequest(CF+path,{token,request});
 if(data.success!==true||!data.result)deny('cloudflare_read_response_invalid');
 return data.result;
}
async function d1Query(sql,token,request,{write=false}={}){
 if(!write&&!/^\s*(SELECT|PRAGMA)\b/i.test(sql))deny('read_only_sql_required');
 if(write&&sql.includes('audit_integrity_checks')===false)deny('approved_additive_sql_required');
 const x=await jsonRequest(D1+'/query',{token,method:'POST',body:{sql},request});
 const output=Array.isArray(x.result)?x.result:[x.result];
 if(x.success!==true||!output.length||
    output.some(item=>item?.success!==true||!Array.isArray(item?.results)))
  deny('d1_query_result_invalid');
 if(write){
  // D1 may return one result for the SQL batch or one per CREATE statement.
  // A partial provider failure is NOT grounds for retry/automatic rollback.
  if(![1,3].includes(output.length))deny('d1_additive_result_shape_invalid');
  return output.flatMap(item=>item.results);
 }
 if(output.length!==1||output[0].meta?.changes!==0)deny('d1_read_changed_data');
 return output[0].results;
}
async function checkGitHub(c,request){
 const [main,env,branches]=await Promise.all([
  jsonRequest(GH+'/commits/main',{token:c.githubToken,request,isGithub:true}),
  jsonRequest(GH+'/environments/corporate-assets-staging-protected',{token:c.githubToken,request,isGithub:true}),
  jsonRequest(GH+'/environments/corporate-assets-staging-protected/deployment-branch-policies?per_page=100',{token:c.githubToken,request,isGithub:true})]);
 if(main.sha!==c.expectedSha)deny('live_main_has_advanced');
 validateEnvironmentPolicy(env,branches.branch_policies);
}
async function requirePrivateWorker(workerReadToken,accountReadToken,request){
 const [deployment,sub,domains]=await Promise.all([
  cfGet('/workers/scripts/bw-corporate-assets-staging/deployments',workerReadToken,request),
  cfGet('/workers/scripts/bw-corporate-assets-staging/subdomain',workerReadToken,request),
  cfGet('/workers/domains',accountReadToken,request)
 ]);
 if(sub.enabled!==false||sub.previews_enabled!==false||
    !Array.isArray(domains)||domains.some(d=>d.service==='bw-corporate-assets-staging'))
  deny('worker_private_exposure_required');
 const active=deployment.deployments?.[0]?.versions||[];
 if(active.length!==1||active[0].percentage!==100)deny('single_inert_worker_version_required');
 const version=await cfGet('/workers/scripts/bw-corporate-assets-staging/versions/'+active[0].version_id,workerReadToken,request);
 const b=version.resources?.bindings||[];
 const one=name=>{const v=b.filter(x=>x.name===name);if(v.length!==1)deny('staging_worker_binding_required');return v[0]};
 if(one('DB').type!=='d1'||(one('DB').database_id||one('DB').id)!==ASSETS_ISOLATED_DB_ID||
    one('THEBE_CORPORATE_ASSETS_ENABLED').text!=='false'||
    one('ASSETS_STAGING_WRITES_ENABLED').text!=='false')
  deny('inert_isolated_worker_required');
}
async function inspectSchema(token,request){
 const metadata=await cfGet('/d1/database/'+ASSETS_ISOLATED_DB_ID,token,request);
 if(metadata.uuid!==ASSETS_ISOLATED_DB_ID||metadata.name!==ASSETS_ISOLATED_DB_NAME)
  deny('wrong_staging_database_identity');
 const objRows=await d1Query("SELECT type,name FROM sqlite_master WHERE type IN ('table','view','index','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY type,name",token,request);
 const objects=objRows.map(x=>({type:x.type,name:x.name}));
 const markerRows=await d1Query('SELECT database_id,environment FROM corporate_assets_staging_identity WHERE id=1',token,request);
 if(markerRows.length!==1)deny('isolated_staging_marker_required');
 const rowCounts={};
 for(const name of COUNTS){
  const rows=await d1Query('SELECT COUNT(*) AS n FROM '+name,token,request);
  if(rows.length!==1||!Number.isSafeInteger(rows[0].n)||rows[0].n<0)deny('staging_counts_unavailable');
  rowCounts[name]=rows[0].n;
 }
 const foreign=await d1Query('PRAGMA foreign_key_check',token,request);
 if(foreign.length!==0)deny('staging_foreign_keys_invalid');
 const existing=new Set(objects.filter(x=>x.type==='table').map(x=>x.name));
 for(const [name,fields] of Object.entries(ASSET_STAGING_REQUIRED_COLUMNS)){
  if(name==='audit_integrity_checks')continue;
  if(!existing.has(name))deny('existing_schema_dependency_missing');
  const columns=await d1Query('PRAGMA table_info('+name+')',token,request);
  const found=new Set(columns.map(x=>x.name));
  if(fields.some(x=>!found.has(x)))deny('existing_schema_column_missing');
 }
 return {metadata,catalog:{objects,rowCounts,marker:markerRows[0]},countDigest:hash(JSON.stringify(rowCounts))};
}
export async function runProtectedAssetsAudit({context,request=fetch}={}){
 assertContext(context||{});
 if(!context.githubToken||!context.d1Token||!context.workerReadToken||!context.accountReadToken)
  deny('dedicated_tokens_required');
 await checkGitHub(context,request);
 await requirePrivateWorker(context.workerReadToken,context.accountReadToken,request);
 const initial=await inspectSchema(context.d1Token,request);
 const review=buildAssetsAuditRepairReview({
  expectedMainSha:context.expectedSha,observedMainSha:context.expectedSha,
  metadata:initial.metadata,catalog:initial.catalog
 });
 const actual=new Set(initial.catalog.objects.map(x=>x.type+':'+x.name));
 if(requiredAbsent.some(x=>actual.has(x)))deny('additive_schema_already_partial');
 if(!actual.has('index:audit_tenant_seq_unique'))deny('canonical_audit_sequence_index_required');
 const bookmark=await cfGet('/d1/database/'+ASSETS_ISOLATED_DB_ID+'/time_travel/bookmark',context.d1Token,request);
 if(typeof bookmark.bookmark!=='string'||!bookmark.bookmark.trim())deny('d1_recovery_bookmark_required');
 const bookmarkHash=hash(bookmark.bookmark);
 const summary={mode:context.mode,status:'reviewable_preflight_only',
  sourceSha:context.expectedSha,databaseId:ASSETS_ISOLATED_DB_ID,
  sqlSha256:review.sqlSha256,bookmarkSha256:bookmarkHash,
  existingTableCount:initial.catalog.objects.filter(x=>x.type==='table'&&!x.name.startsWith('_cf_')).length,
  missingRequiredTable:review.missingRequiredTables[0],
  changesPerformed:false,assetsEnabled:false,productionChanged:false};
 if(context.mode==='preflight-only')return Object.freeze(summary);
 if(context.expectedSqlHash!==review.sqlSha256||
    context.expectedBookmarkHash!==bookmarkHash)deny('scoped_sql_or_bookmark_mismatch');
 const comment=await jsonRequest(GH+'/issues/comments/'+context.ownerCommentId,{
  token:context.githubToken,request,isGithub:true});
 validateOwnerApproval(comment,{sha:context.expectedSha,sqlHash:review.sqlSha256,
  bookmarkHash,commentId:context.ownerCommentId});
 // Fresh protected-main and database recheck immediately before any DDL.
 await checkGitHub(context,request);
 const now=await inspectSchema(context.d1Token,request);
 if(hash(JSON.stringify(now.catalog))!==hash(JSON.stringify(initial.catalog)))
  deny('staging_schema_or_data_changed_before_write');
 const newBookmark=await cfGet('/d1/database/'+ASSETS_ISOLATED_DB_ID+'/time_travel/bookmark',context.d1Token,request);
 if(hash(newBookmark.bookmark||'')!==bookmarkHash)deny('recovery_bookmark_changed_before_write');
 // Exactly three canonical CREATE statements; never data writes, DROP or rollback.
 await d1Query(review.sql,context.d1Token,request,{write:true});
 const after=await inspectSchema(context.d1Token,request);
 const newObjs=after.catalog.objects
  .map(x=>x.type+':'+x.name).filter(x=>!actual.has(x)).sort();
 if(JSON.stringify(newObjs)!==JSON.stringify([...requiredAbsent].sort()))
  deny('post_migration_objects_mismatch_inspect_manually');
 if(after.countDigest!==initial.countDigest||
    JSON.stringify(after.catalog.marker)!==JSON.stringify(initial.catalog.marker))
  deny('post_migration_records_or_identity_changed_inspect_manually');
 const dbAdapter={prepare(sql){return {
  first:async()=>{const rows=await d1Query(sql,context.d1Token,request);return rows[0]||null},
  all:async()=>({results:await d1Query(sql,context.d1Token,request)})
 }}};
 const checked=await corporateAssetsStagingSchemaPreflight({
  APP_ENV:'staging',ASSETS_STAGING_D1_ID:ASSETS_ISOLATED_DB_ID,DB:dbAdapter});
 if(checked.ready!==true)deny('post_migration_preflight_failed_inspect_manually');
 await checkGitHub(context,request);
 return Object.freeze({...summary,status:'additive_staging_schema_verified',
  changesPerformed:true,assetsEnabled:false,productionChanged:false,
  rollbackNotPerformed:true,manualRecoveryApprovalStillRequired:true});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const c={repository:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF,
  githubSha:process.env.GITHUB_SHA,expectedSha:process.env.EXPECTED_MAIN_SHA,
  actor:process.env.GITHUB_ACTOR,mode:process.env.ASSETS_D1_MODE,
  authorization:process.env.ASSETS_D1_AUTHORIZATION,
  ownerCommentId:process.env.ASSETS_D1_OWNER_COMMENT_ID,
  expectedSqlHash:process.env.ASSETS_D1_EXPECTED_SQL_SHA256,
  expectedBookmarkHash:process.env.ASSETS_D1_EXPECTED_BOOKMARK_SHA256,
  githubToken:process.env.ASSETS_STAGING_GITHUB_READ_TOKEN,
  d1Token:process.env.ASSETS_STAGING_D1_TOKEN,
  workerReadToken:process.env.ASSETS_STAGING_WORKER_READ_TOKEN,
  accountReadToken:process.env.ASSETS_STAGING_ACCOUNT_READ_TOKEN};
 runProtectedAssetsAudit({context:c}).then(x=>console.log(JSON.stringify(x))).catch(e=>{
  const allowed=/^[a-z0-9_]{4,95}$/.test(e?.message||'')?e.message:'protected_assets_d1_unknown_failure';
  console.error(allowed);process.exitCode=1;
 });
}
