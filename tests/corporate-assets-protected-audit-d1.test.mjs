import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {runProtectedAssetsAudit,expectedOwnerApprovalText,validateOwnerApproval}
 from '../scripts/corporate-assets-protected-audit-d1.mjs';
import {buildOfflineAssetsStagingSql} from '../scripts/corporate-assets-staging-offline-bootstrap-receipt.mjs';

const MAIN='a'.repeat(40);
const DB='e19f09de-3bb9-4021-b4f8-44df04c8aaa8';
const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
const REPO='adinosassist-stack/botswana-compliance-platform';
const HOST='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const GH='https://api.github.com/repos/'+REPO;
const COMMENT=6934567891;
const auth='APPLY_ISOLATED_ASSETS_AUDIT_ADDITIVE_ONLY';
const env={can_admins_bypass:false,
 protection_rules:[{type:'required_reviewers',prevent_self_review:true,
  reviewers:[{type:'User',reviewer:{login:'thusico'}}]}],
 deployment_branch_policy:{custom_branch_policies:true,protected_branches:false}};
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(buildOfflineAssetsStagingSql({expectedMainSha:MAIN}).sql.replace(
  /CREATE TABLE IF NOT EXISTS audit_integrity_checks\([\s\S]*?\n\);/,''));
 db.prepare('INSERT INTO tenants(id,name) VALUES(?,?)').run('synthetic-tenant','A');
 db.prepare('INSERT INTO users(id,email) VALUES(?,?)').run('synthetic-owner','owner@example.invalid');
 db.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'owner','active')")
  .run('synthetic-tenant','synthetic-owner');
 db.prepare("INSERT INTO corporate_assets(id,tenant_id,name,category,branch,acquisition_date,acquisition_cost_minor,book_value_minor,status) VALUES(?,?,?,?,?,?,?,?,?)")
  .run('synthetic-asset','synthetic-tenant','Synthetic Asset','machinery','Office','2026-01-01',10000,9000,'active');
 db.prepare("INSERT INTO corporate_asset_services(id,tenant_id,asset_id,kind,serviced_on,due_on,cost_minor,description) VALUES(?,?,?,?,?,?,?,?)")
  .run('synthetic-service','synthetic-tenant','synthetic-asset','service','2026-01-01','2027-01-01',300,'Synthetic service');
 const state={db,fetches:[],ddlCount:0,comment:null,main:MAIN,
  privateVersion:true,bookmark:'synthetic-bookmark-not-a-credential'};
 const reply=(result,status=200)=>new Response(JSON.stringify(result),{status,
  headers:{'content-type':'application/json'}});
 const request=async(url,options={})=>{
  const {method='GET'}=options;
  state.fetches.push({url,method});
  if(url===GH+'/commits/main')return reply({sha:state.main});
  if(url===GH+'/environments/corporate-assets-staging-protected')return reply(env);
  if(url.startsWith(GH+'/environments/corporate-assets-staging-protected/deployment-branch-policies'))
   return reply({branch_policies:[{name:'main',type:'branch'}]});
  if(url===GH+'/issues/comments/'+COMMENT)return reply(state.comment||{});
  if(url===HOST+'/d1/database/'+DB)return reply({success:true,result:{name:'bw-corporate-assets-staging',uuid:DB,num_tables:11}});
  if(url===HOST+'/d1/database/'+DB+'/time_travel/bookmark')return reply({success:true,result:{bookmark:state.bookmark}});
  if(url===HOST+'/workers/scripts/bw-corporate-assets-staging/deployments')
   return reply({success:true,result:{deployments:[{versions:[{version_id:'mock-version',percentage:100}]}]}});
  if(url===HOST+'/workers/scripts/bw-corporate-assets-staging/subdomain')
   return reply({success:true,result:{enabled:false,previews_enabled:false}});
  if(url===HOST+'/workers/domains')return reply({success:true,result:[]});
  if(url===HOST+'/workers/scripts/bw-corporate-assets-staging/versions/mock-version'){
   return reply({success:true,result:{resources:{bindings:[
    {name:'DB',type:'d1',database_id:DB},
    {name:'THEBE_CORPORATE_ASSETS_ENABLED',type:'plain_text',text:state.privateVersion?'false':'true'},
    {name:'ASSETS_STAGING_WRITES_ENABLED',type:'plain_text',text:'false'}]}}});
  }
  if(url===HOST+'/d1/database/'+DB+'/query'&&method==='POST'){
   const {sql}=JSON.parse(options.body||'{}');
   if(/^\s*(SELECT|PRAGMA)\b/i.test(sql)){
    const results=db.prepare(sql).all();
    return reply({success:true,result:[{success:true,results,meta:{changes:0}}]});
   }
   if(!sql.startsWith('CREATE TABLE IF NOT EXISTS audit_integrity_checks('))
    throw Error('test detected unexpected write SQL');
   state.ddlCount++;
   db.exec(sql);
   return reply({success:true,result:[
    {success:true,results:[],meta:{changes:0}},
    {success:true,results:[],meta:{changes:0}},
    {success:true,results:[],meta:{changes:0}}
   ]});
  }
  throw Error('unexpected test request: '+method+' '+url);
 };
 const context={
  repository:REPO,ref:'refs/heads/main',githubSha:MAIN,expectedSha:MAIN,
  actor:'adinosassist-stack',mode:'preflight-only',
  authorization:'READ_ONLY_ASSETS_D1_PREFLIGHT',
  githubToken:'test-github-token',d1Token:'test-staging-read-token',
  workerReadToken:'test-worker-read-token',accountReadToken:'test-account-read-token'};
 return {state,request,context,close:()=>db.close()};
}

test('protected read-only exact-main preflight checks existing D1 and never issues CREATE',async()=>{
 const f=setup();
 try{
  const receipt=await runProtectedAssetsAudit({context:f.context,request:f.request});
  assert.equal(receipt.status,'reviewable_preflight_only');
  assert.equal(receipt.changesPerformed,false);
  assert.equal(receipt.existingTableCount,11);
  assert.match(receipt.bookmarkSha256,/^[a-f0-9]{64}$/);
  assert.match(receipt.sqlSha256,/^[a-f0-9]{64}$/);
  assert.equal(f.state.ddlCount,0);
  assert.ok(f.state.fetches.every(x=>x.method==='GET'||x.method==='POST'));
  assert.equal(f.state.db.prepare('SELECT COUNT(*) AS n FROM corporate_assets').get().n,1);
 }finally{f.close()}
});
test('unauthorized calls, malformed owner approval and source/traffic drift fail before D1 writes',async()=>{
 const f=setup();
 try{
  let receipt=await runProtectedAssetsAudit({context:f.context,request:f.request});
  const applying={...f.context,mode:'apply-approved',authorization:auth,
   ownerCommentId:COMMENT,expectedSqlHash:receipt.sqlSha256,
   expectedBookmarkHash:receipt.bookmarkSha256};
  await assert.rejects(runProtectedAssetsAudit({context:applying,request:f.request}),/explicit_immutable_owner_issue_approval_required/);
  await assert.rejects(runProtectedAssetsAudit({context:{...applying,actor:'thusico'},request:f.request}),/reviewer_cannot_initiate/);
  await assert.rejects(runProtectedAssetsAudit({context:{...applying,actor:'intruder'},request:f.request}),/specific_owner_write_scope_required/);
  await assert.rejects(runProtectedAssetsAudit({context:{...applying,expectedSqlHash:'b'.repeat(64)},request:f.request}),/scoped_sql_or_bookmark_mismatch/);
  await assert.rejects(runProtectedAssetsAudit({context:{...applying,expectedBookmarkHash:'b'.repeat(64)},request:f.request}),/scoped_sql_or_bookmark_mismatch/);
  f.state.main='b'.repeat(40);
  await assert.rejects(runProtectedAssetsAudit({context:f.context,request:f.request}),/live_main_has_advanced/);
  f.state.main=MAIN;
  f.state.privateVersion=false;
  await assert.rejects(runProtectedAssetsAudit({context:f.context,request:f.request}),/inert_isolated_worker_required/);
  assert.equal(f.state.ddlCount,0);
  assert.equal(f.state.db.prepare('SELECT COUNT(*) n FROM corporate_assets').get().n,1);
 }finally{f.close()}
});
test('only specific immutable owner issue scope plus unchanged bookmark permits 3 canonical DDL locally',async()=>{
 const f=setup();
 try{
  const pre=await runProtectedAssetsAudit({context:f.context,request:f.request});
  const body=expectedOwnerApprovalText({sha:MAIN,sqlHash:pre.sqlSha256,bookmarkHash:pre.bookmarkSha256});
  f.state.comment={
   id:COMMENT,user:{login:'adinosassist-stack'},issue_url:GH+'/issues/2204',
   created_at:'2026-11-17T01:00:00Z',updated_at:'2026-11-17T01:00:00Z',body};
  const approved={...f.context,mode:'apply-approved',authorization:auth,
   ownerCommentId:COMMENT,expectedSqlHash:pre.sqlSha256,expectedBookmarkHash:pre.bookmarkSha256};
  assert.equal(validateOwnerApproval(f.state.comment,
   {sha:MAIN,sqlHash:pre.sqlSha256,bookmarkHash:pre.bookmarkSha256,commentId:COMMENT}),true);
  const existing=f.state.db.prepare('SELECT id,name,book_value_minor FROM corporate_assets').all();
  const result=await runProtectedAssetsAudit({context:approved,request:f.request});
  assert.equal(result.status,'additive_staging_schema_verified');
  assert.equal(result.changesPerformed,true);
  assert.equal(result.assetsEnabled,false);
  assert.equal(result.rollbackNotPerformed,true);
  assert.equal(f.state.ddlCount,1);
  assert.deepEqual(f.state.db.prepare('SELECT id,name,book_value_minor FROM corporate_assets').all(),existing);
  assert.deepEqual(f.state.db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(f.state.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  await assert.rejects(runProtectedAssetsAudit({context:approved,request:f.request}),
   /isolated_audit_only_repair_scope_required/,'cannot replay an already applied migration');
  assert.equal(f.state.ddlCount,1);
 }finally{f.close()}
});
test('changed owner comment, bookmark and partially repaired schema never authorize remote writes',async()=>{
 const f=setup();
 try{
  const pre=await runProtectedAssetsAudit({context:f.context,request:f.request});
  const context={...f.context,mode:'apply-approved',authorization:auth,ownerCommentId:COMMENT,
   expectedSqlHash:pre.sqlSha256,expectedBookmarkHash:pre.bookmarkSha256};
  const correct=expectedOwnerApprovalText({sha:MAIN,sqlHash:pre.sqlSha256,bookmarkHash:pre.bookmarkSha256});
  f.state.comment={id:COMMENT,user:{login:'adinosassist-stack'},issue_url:GH+'/issues/2204',
   created_at:'2026-11-17T01:00:00Z',updated_at:'2026-11-17T01:01:00Z',body:correct};
  await assert.rejects(runProtectedAssetsAudit({context,request:f.request}),/explicit_immutable_owner_issue_approval_required/);
  f.state.comment.updated_at=f.state.comment.created_at;
  f.state.bookmark='different-unsigned-staging-bookmark';
  await assert.rejects(runProtectedAssetsAudit({context,request:f.request}),/scoped_sql_or_bookmark_mismatch/);
  f.state.bookmark='synthetic-bookmark-not-a-credential';
  f.state.db.exec('CREATE INDEX IF NOT EXISTS audit_write_failures_tenant_idx ON audit_write_failures(tenant_id,resolved_at,created_at DESC)');
  await assert.rejects(runProtectedAssetsAudit({context,request:f.request}),/additive_schema_already_partial/);
  assert.equal(f.state.ddlCount,0);
 }finally{f.close()}
});
