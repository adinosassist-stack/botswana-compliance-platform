import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {applyPopProductionPhase} from '../scripts/apply-pop-production-phase.mjs';
const SHA='a'.repeat(40),REPO='adinosassist-stack/botswana-compliance-platform';
const DBID='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
const NOW=Date.parse('2026-11-05T10:00:00Z');
const paths={'070':'cloudflare/migrations/070_payment_pop_documents.sql','071':'cloudflare/migrations/071_payment_pop_runtime_compat.sql'};
function fixture(phase='070',change=()=>{}){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON; CREATE TABLE tenants(id TEXT PRIMARY KEY); CREATE TABLE payment_orders(id TEXT PRIMARY KEY); CREATE TABLE manual_payment_submissions(id TEXT PRIMARY KEY);');
 if(phase==='071')db.exec(readFileSync(paths['070'],'utf8'));
 const env={GITHUB_REPOSITORY:REPO,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_SHA:SHA,EXPECTED_SHA:SHA,POP_PHASE:phase,POP_CONFIRM:'APPLY_ONE_REVIEWED_POP_SCHEMA_PHASE',POP_PRODUCTION_GITHUB_READ_TOKEN:'github-fixture',POP_PRODUCTION_CLOUDFLARE_TOKEN:'cloudflare-fixture',POP_OWNER_APPROVAL_ID:'11',POP_REVIEW_APPROVAL_ID:'12'};
 const proof={scope:'ONE_POP_SCHEMA_PHASE_ONLY',phase,sourceSha:SHA,sqlSha256:createHash('sha256').update(readFileSync(paths[phase])).digest('hex'),accountId:ACCOUNT,databaseId:DBID,backupRunId:'21',backupReceiptSha256:'b'.repeat(64),restoreRunId:'22',recoveryAccepted:true,expiresAt:'2026-11-05T11:00:00Z'};
 let writes=0,calls=0,mainReads=0;
 const request=async(url,options)=>{
  calls++;let data;
  if(url.startsWith('https://api.github.com/')){
   assert.equal(options.method,'GET','GitHub authorization verification is GET-only');
   const path=url.split('/'+REPO+'/')[1];
   if(path==='git/ref/heads/main'){mainReads++;data={object:{sha:SHA}}}
   else if(path==='environments/pop-production-migration')data={name:'pop-production-migration',can_admins_bypass:false,protection_rules:[{type:'required_reviewers',prevent_self_review:true,reviewers:[{type:'User',reviewer:{login:'thusico'}}]}],deployment_branch_policy:{custom_branch_policies:true,protected_branches:false}};
   else if(path.endsWith('/deployment-branch-policies'))data={total_count:1,branch_policies:[{name:'main',type:'branch'}]};
   else if(path.startsWith('issues/comments/')){const id=path.endsWith('/11')?'11':'12';data={id:Number(id),user:{login:id==='11'?'adinosassist-stack':'thusico'},issue_url:'https://api.github.com/repos/'+REPO+'/issues/1950',created_at:'2026-11-05T09:00:00Z',body:'THEBE_POP_PRODUCTION_PHASE_APPROVAL\n'+JSON.stringify(proof)}}
   else if(path.startsWith('actions/runs/')){const backup=path.endsWith('/21');data={repository:{full_name:REPO},head_branch:'main',head_sha:SHA,event:'workflow_dispatch',status:'completed',conclusion:'success',updated_at:'2026-11-05T09:30:00Z',path:'.github/workflows/'+(backup?'private-production-backup-candidate.yml':'isolated-operations-rehearsals.yml'),display_title:backup?'Private backup candidate '+SHA:'Isolated operations RESTORE_APPROVED_BACKUP '+SHA}}
   else throw Error('unexpected GitHub endpoint');
   change({path,data,mainReads,db});
  }else{
   assert.ok(url.startsWith('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/'));
   if(url.endsWith('/settings'))data={success:true,result:{bindings:['POP_UPLOAD_STAGING_ENABLED','EVIDENCE_UPLOADS_ENABLED','THEBE_AI_EXPORTS_ENABLED'].map(name=>({name,type:'plain_text',text:'false'}))}};
   else if(url.endsWith('/d1/database/'+DBID))data={success:true,result:{uuid:DBID,name:'bw-compliance-os'}};
   else if(url.endsWith('/query')){
    const sql=JSON.parse(options.body).sql;let results=[];
    if(/^SELECT|^PRAGMA/.test(sql))results=db.prepare(sql).all();
    else {writes++;db.exec(sql)}
    data={success:true,result:[{success:true,results,meta:{rows_written:0}}]};
   }else throw Error('unexpected Cloudflare endpoint');
   change({path:url,data,mainReads,db});
  }
  return {ok:true,json:async()=>data};
 };
 return {env,proof,db,request,now:()=>NOW,writes:()=>writes,calls:()=>calls,close:()=>db.close()};
}
for(const phase of ['070','071'])test('authorized '+phase+' executes only its exact SQLite migration and preserves payment inactivity',async()=>{
 const f=fixture(phase);try{const r=await applyPopProductionPhase(f.env,f);assert.equal(f.writes(),1);assert.equal(r.migrationApplied,true);assert.equal(r.popEnabled,false);assert.equal(r.subscriptionActivated,false);assert.equal(r.postSchemaVerified,true);assert.equal(f.db.prepare("SELECT count(*) n FROM payment_pop_documents").get().n,0)}finally{f.close()}
});
for(const [label,change,reason] of [
 ['wrong reviewer',({path,data})=>{if(path==='issues/comments/12')data.user.login='adinosassist-stack'},'approval_identity'],
 ['expired approval',({path,data})=>{if(path?.startsWith('issues/comments/')){const p=JSON.parse(data.body.split('\n')[1]);p.expiresAt='2026-11-05T09:59:00Z';data.body='THEBE_POP_PRODUCTION_PHASE_APPROVAL\n'+JSON.stringify(p)}},'approval_expiry'],
 ['main moves at final gate',({path,data,mainReads})=>{if(path==='git/ref/heads/main'&&mainReads===2)data.object.sha='c'.repeat(40)},'main_drift'],
 ['admin bypass allowed',({path,data})=>{if(path==='environments/pop-production-migration')data.can_admins_bypass=true},'environment_protection'],
 ['self review allowed',({path,data})=>{if(path==='environments/pop-production-migration')data.protection_rules[0].prevent_self_review=false},'environment_protection'],
 ['wildcard branch',({path,data})=>{if(path?.endsWith('/deployment-branch-policies'))data.branch_policies[0].name='*'},'environment_main_only'],
 ['stale backup',({path,data})=>{if(path==='actions/runs/21')data.updated_at='2026-11-04T00:00:00Z'},'backup_freshness'],
 ['preflight mistaken for restore',({path,data})=>{if(path==='actions/runs/22')data.display_title='Isolated operations PREFLIGHT_ONLY '+SHA},'restore_run_scope'],
 ['live uploads already enabled',({path,data})=>{if(path?.endsWith('/settings'))data.result.bindings[0].text='true'},'feature_flags'],
 ['live evidence uploads already enabled',({path,data})=>{if(path?.endsWith('/settings'))data.result.bindings.find(x=>x.name==='EVIDENCE_UPLOADS_ENABLED').text='true'},'feature_flags'],
 ['missing evidence upload kill switch',({path,data})=>{if(path?.endsWith('/settings'))data.result.bindings=data.result.bindings.filter(x=>x.name!=='EVIDENCE_UPLOADS_ENABLED')},'feature_flags']
])test(label+' prevents every production write',async()=>{const f=fixture('070',change);try{await assert.rejects(applyPopProductionPhase(f.env,f),new RegExp(reason));assert.equal(f.writes(),0)}finally{f.close()}});
test('already applied and partial phases refuse replay',async()=>{for(const phase of ['070','071']){const f=fixture(phase);try{f.db.exec(phase==='070'?readFileSync(paths['070'],'utf8'):'ALTER TABLE payment_pop_documents ADD COLUMN content_sha256 TEXT');await assert.rejects(applyPopProductionPhase(f.env,f),/partial_or_replayed/);assert.equal(f.writes(),0)}finally{f.close()}}});
test('source or dispatch drift stops before any provider access',async()=>{for(const update of [{GITHUB_EVENT_NAME:'schedule'},{POP_CONFIRM:'go'},{EXPECTED_SHA:'c'.repeat(40)}]){const f=fixture();try{Object.assign(f.env,update);await assert.rejects(applyPopProductionPhase(f.env,f),/pop_production_hold_/);assert.equal(f.calls(),0)}finally{f.close()}}});
test('provider failures are sanitized and never retried',async()=>{const f=fixture();let calls=0;try{await assert.rejects(applyPopProductionPhase(f.env,{...f,request:async()=>{calls++;throw Error('sensitive-response')}}),/pop_production_hold_provider_unavailable/);assert.equal(calls,1);assert.equal(f.writes(),0)}finally{f.close()}});
test('changed migration bytes fail before any provider access',async()=>{const f=fixture();try{await assert.rejects(applyPopProductionPhase(f.env,{...f,read:()=>Buffer.from('unreviewed SQL')}),/sql_drift/);assert.equal(f.calls(),0)}finally{f.close()}});
test('phase 071 refuses an existing 070 table without the required foreign keys',async()=>{const f=fixture('071');try{f.db.exec('PRAGMA foreign_keys=OFF; ALTER TABLE payment_pop_documents RENAME TO old_documents; CREATE TABLE payment_pop_documents AS SELECT * FROM old_documents; DROP TABLE old_documents; CREATE INDEX payment_pop_documents_order_idx ON payment_pop_documents(tenant_id,payment_order_id,uploaded_at DESC); CREATE INDEX payment_pop_documents_scan_idx ON payment_pop_documents(scan_status,uploaded_at);');await assert.rejects(applyPopProductionPhase(f.env,f),/schema_foreign_keys/);assert.equal(f.writes(),0)}finally{f.close()}});
