// Read-only POP 070/071 release-gate evidence. No migrations, uploads, or writes.
// Inputs must be supplied by an independently reviewed, protected run.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const PROD_UUID='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const EXPECTED_ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
const MIGRATIONS=[
  ['070','cloudflare/migrations/070_payment_pop_documents.sql','f52f9c8e429670cf2e5956b7610e7f1e9b8594e946470ee331ecf06f979c9261'],
  ['071','cloudflare/migrations/071_payment_pop_runtime_compat.sql','24cb1d9e42ef6edaaf04ba53f3945f5112cc61b0c3d52010480be4603c38dc3c'],
];
const sha256=value=>createHash('sha256').update(value).digest('hex');
const fail=(code)=>{throw Error('pop_production_preflight_'+code)};
const requiredTables=['tenants','payment_orders','manual_payment_submissions'];
const names=['payment_pop_documents','payment_pop_upload_requests','payment_pop_documents_order_idx','payment_pop_documents_scan_idx','payment_pop_upload_requests_tenant_idx'];
const fixedSQL="SELECT name,type FROM sqlite_master WHERE name IN ('tenants','payment_orders','manual_payment_submissions','payment_pop_documents','payment_pop_upload_requests','payment_pop_documents_order_idx','payment_pop_documents_scan_idx','payment_pop_upload_requests_tenant_idx','d1_migrations') ORDER BY name";

export function classifyPopCatalog(rows){
 if(!Array.isArray(rows)||rows.some(r=>!r||typeof r.name!=='string'||!['index','table'].includes(r.type)))fail('invalid_catalog');
 const byName=new Map(rows.map(row=>[row.name,row.type]));
 if(byName.size!==rows.length)fail('duplicate_catalog');
 const missingPrerequisites=requiredTables.filter(name=>byName.get(name)!=='table');
 const present=names.filter((name,i)=>byName.get(name)===(i<2?'table':'index'));
 const malformed=names.filter((name,i)=>byName.has(name)&&byName.get(name)!==(i<2?'table':'index'));
 const state=missingPrerequisites.length||malformed.length?'hold_incompatible':present.length===0?'ready_for_independent_migration_review':present.length===names.length?'already_present_requires_provenance_review':'hold_partial_state';
 return {state,missingPrerequisites,malformed,presentPopObjects:present,missingPopObjects:names.filter(name=>!present.includes(name)),migrationHistoryTablePresent:byName.get('d1_migrations')==='table',productionWriteAuthorized:false};
}
export function verifyPinnedSource(){
 return MIGRATIONS.map(([phase,path,expected])=>{
  const digest=sha256(readFileSync(path));
  if(digest!==expected)fail('migration_'+phase+'_source_mismatch');
  return {phase,path,sha256:digest};
 });
}
export async function inspectProduction({accountId,token,commitSha,expectedMainSha,request=fetch}){
 if(accountId!==EXPECTED_ACCOUNT)fail('account_mismatch');
 if(!/^[a-f0-9]{40}$/.test(commitSha||'')||commitSha!==expectedMainSha)fail('head_mismatch');
 if(typeof token!=='string'||!token)fail('credential_missing');
 const migrations=verifyPinnedSource();
 const base='https://api.cloudflare.com/client/v4/accounts/'+accountId+'/d1/database/'+PROD_UUID;
 async function call(path,body){
  const response=await request(base+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)fail('provider_unavailable');
  const data=await response.json();
  if(data?.success!==true)fail('provider_failed');
  return data.result;
 }
 const identity=await call('');
 if(identity?.uuid?.toLowerCase()!==PROD_UUID||identity?.name!=='bw-compliance-os')fail('target_mismatch');
 const result=await call('/query',{sql:fixedSQL,params:[]});
 if(!Array.isArray(result)||result.length!==1||result[0]?.success!==true||!Array.isArray(result[0].results)||result[0]?.meta?.rows_written!==0)fail('query_not_readonly');
 const classified=classifyPopCatalog(result[0].results);
 return {kind:'pop_production_070_071_readonly_preflight',mode:'NO_WRITE',sourceSha:commitSha,databaseId:PROD_UUID,migrations,...classified,readOnlyQueryVerified:true,backupAcceptanceVerified:false,retentionAcceptanceVerified:false,rollbackAcceptanceVerified:false,independentReviewVerified:false,productionWriteAuthorized:false,migrationApplied:false,popActivated:false,subscriptionActivated:false};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 try {
  const report=await inspectProduction({accountId:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN,commitSha:process.env.GITHUB_SHA,expectedMainSha:process.env.EXPECTED_MAIN_SHA});
  console.log(JSON.stringify(report));
  if(report.state!=='ready_for_independent_migration_review')process.exitCode=2;
 }catch(e){console.error(e.message.startsWith('pop_production_preflight_')?e.message:'pop_production_preflight_unavailable');process.exitCode=2}
}
