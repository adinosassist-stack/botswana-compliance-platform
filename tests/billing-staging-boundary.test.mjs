import test from 'node:test';
import assert from 'node:assert/strict';
import {renderBillingStagingConfig,billingStagingMarkerSql} from '../scripts/render-billing-staging-config.mjs';
import {DatabaseSync} from 'node:sqlite';
import {createBillingStagingEntry,BILLING_STAGING_ORIGIN} from '../cloudflare/src/billing-staging-entry.js';
import {preparePlatformOwnerLogin,withPlatformOwnerAdminEnv} from '../cloudflare/src/platform-owner-access.js';

const inputs={BILLING_STAGING_D1_ID:'11111111-1111-4111-8111-111111111111',PRODUCTION_D1_DATABASE_ID:'22222222-2222-4222-8222-222222222222',BILLING_STAGING_SOURCE_SHA:'a'.repeat(40),BILLING_STAGING_ADMIN_EMAILS:'billing-owner@example.invalid'};
const config=()=>renderBillingStagingConfig(inputs);
const qualifiedDb={prepare(){return {first:async()=>({database_id:inputs.BILLING_STAGING_D1_ID,environment:'billing-staging'})}}};
const request=(path,method='GET')=>new Request(BILLING_STAGING_ORIGIN+path,{method,...(method==='POST'?{body:'{"test":true}',headers:{'content-type':'application/json'}}:{})});

test('configuration pins separate Worker, database and storage identities with no schedules',()=>{
 const c=config();assert.equal(c.name,'bw-billing-staging');assert.equal(c.keep_vars,false);assert.equal(c.workers_dev,false);assert.equal(c.preview_urls,false);
 assert.deepEqual(c.d1_databases,[{binding:'DB',database_name:'bw-billing-staging',database_id:inputs.BILLING_STAGING_D1_ID}]);
 assert.deepEqual(c.r2_buckets,[{binding:'EVIDENCE',bucket_name:'bw-billing-staging-pop'}]);
 assert.equal(c.triggers,undefined);assert.equal(c.ai,undefined);assert.equal(c.vars.REGISTRATION_MODE,'hold');
 assert.equal(c.vars.EVIDENCE_UPLOADS_ENABLED,'false');assert.equal(c.vars.POP_UPLOAD_STAGING_ENABLED,'false');assert.equal(c.vars.PAYMENT_PROVIDER,'none');
});
for(const bad of [inputs.PRODUCTION_D1_DATABASE_ID,'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce','20c0d37e-552e-438f-a56d-3f12c27d38e2','20C0D37E-552E-438F-A56D-3F12C27D38E2'])test('refuses production or regulatory staging D1: '+bad,()=>{
 assert.throws(()=>renderBillingStagingConfig({...inputs,BILLING_STAGING_D1_ID:bad}),/database_forbidden/);
});
for(const overrides of [{BILLING_STAGING_D1_ID:''},{PRODUCTION_D1_DATABASE_ID:''},{BILLING_STAGING_SOURCE_SHA:'main'},{BILLING_STAGING_ADMIN_EMAILS:''},{BILLING_STAGING_ADMIN_EMAILS:'x@example.invalid\nmalformed'}])test('refuses incomplete or unsafe configuration '+JSON.stringify(overrides),()=>{
 assert.throws(()=>renderBillingStagingConfig({...inputs,...overrides}),/billing_staging_/);
});
test('an explicitly selected owner email may be reused in isolated staging',()=>{
 const c=renderBillingStagingConfig({...inputs,BILLING_STAGING_ADMIN_EMAILS:'thebedesk@gmail.com'});
 assert.equal(c.vars.PLATFORM_ADMIN_EMAILS,'thebedesk@gmail.com');
 assert.equal(c.vars.REGISTRATION_MODE,'hold');assert.equal(c.vars.PAYMENT_PROVIDER,'none');
 assert.equal(c.d1_databases[0].database_id,inputs.BILLING_STAGING_D1_ID);
});
test('billing staging admin allowlist is explicit and does not inject the production owner',()=>{
 const env={...config().vars,PLATFORM_ADMIN_EMAILS:'designated@example.invalid'};
 const result=withPlatformOwnerAdminEnv(env);
 assert.equal(result.PLATFORM_ADMIN_EMAILS,'designated@example.invalid');
 assert.equal(env.PLATFORM_ADMIN_EMAILS,'designated@example.invalid');
 for(const patch of [{APP_ENV:'production'},{DEPLOYMENT_PROFILE:'workers-free-first'}]){
  assert.match(withPlatformOwnerAdminEnv({...env,...patch}).PLATFORM_ADMIN_EMAILS,/thebedesk@gmail.com/);
 }
});
test('staging owner login leaves membership, entitlements and regulatory principals untouched',async()=>{
 const req=new Request(BILLING_STAGING_ORIGIN+'/api/auth/login',{method:'POST',headers:{origin:BILLING_STAGING_ORIGIN,'content-type':'application/json'},body:JSON.stringify({email:'thebedesk@gmail.com',password:'test-only'})});
 const env={...config().vars,DB:{prepare(){throw Error('staging login must not repair production-owner privileges')}}};
 assert.equal(await preparePlatformOwnerLogin(req,env),req);
 assert.deepEqual(await req.json(),{email:'thebedesk@gmail.com',password:'test-only'});
});
test('owner login preparation remains active outside the exact billing staging profile',async()=>{
 for(const patch of [{APP_ENV:'production'},{DEPLOYMENT_PROFILE:'workers-free-first'}]){
  let queries=0;
  const env={...config().vars,...patch,DB:{prepare(sql){assert.match(sql,/SELECT id,password_hash FROM users/);queries++;return {bind(){return {first:async()=>null}}}}}};
  const req=new Request(BILLING_STAGING_ORIGIN+'/api/auth/login',{method:'POST',headers:{origin:BILLING_STAGING_ORIGIN,'content-type':'application/json'},body:JSON.stringify({email:'thebedesk@gmail.com',password:'test-only'})});
  assert.equal(await preparePlatformOwnerLogin(req,env),req);assert.equal(queries,1);
 }
});
test('configuration ignores attempted production routes, buckets and runtime overrides',()=>{
 assert.deepEqual(renderBillingStagingConfig({...inputs,PUBLIC_ORIGIN:'https://thebedesk.com',EVIDENCE_BUCKET:'bw-compliance-evidence',PAYMENT_PROVIDER:'dpo',POP_UPLOAD_STAGING_ENABLED:'true'}),config());
});

for(const path of ['/api/platform/billing/subscription-access','/api/platform/billing/manual-payments/x/approve','/api/payments/manual-bank/submit','/api/payments/manual-bank/pop/stage','/api/platform/regulatory/rules/approve','/api/agentic/tasks','/api/auth/register','/api/webhooks/payments','/public/employee-report'])test('mutation is blocked before downstream access: '+path,async()=>{
 const entry=createBillingStagingEntry({fetch(){throw Error('must not delegate')}});
 for(const alias of [path,'/__thebe_api/'+path.slice(5),'/?__thebe_api_path='+encodeURIComponent(path)]){
  assert.equal((await entry.fetch(request(alias,'POST'),config().vars,{})).status,403);
 }
});
for(const path of ['/api/payments/return?order=x','/api/platform/billing/new-unsafe-endpoint','/api/platform/regulatory/rules','/api/agentic/tasks'])test('read allowlist blocks side-effecting and unknown GET routes: '+path,async()=>{
 assert.equal((await createBillingStagingEntry({fetch(){throw Error('must not delegate')}}).fetch(request(path),config().vars,{})).status,403);
});
test('login body survives the boundary while credentials and flags cannot enable integrations',async()=>{
 const entry=createBillingStagingEntry({async fetch(req,env){
  assert.deepEqual(await req.json(),{test:true});assert.equal(env.PAYMENT_PROVIDER,'none');assert.equal(env.POP_UPLOAD_STAGING_ENABLED,'false');assert.equal(env.OPENAI_API_KEY,undefined);assert.equal(env.RESEND_API_KEY,undefined);assert.equal(env.OPERATIONS_SECRET,undefined);assert.equal(env.AI,undefined);return Response.json({ok:true});
 }});
 for(const alias of ['/api/auth/login','/__thebe_api/auth/login','/?__thebe_api_path=%2Fapi%2Fauth%2Flogin']){
  const response=await entry.fetch(request(alias,'POST'),{...config().vars,DB:qualifiedDb,PAYMENT_PROVIDER:'dpo',POP_UPLOAD_STAGING_ENABLED:'true',OPENAI_API_KEY:'must-not-forward',RESEND_API_KEY:'must-not-forward',OPERATIONS_SECRET:'must-not-forward',AI:{}},{});
  assert.equal(response.status,200);assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
 }
 assert.equal(entry.scheduled,undefined);
});
test('status identifies source SHA without asserting authenticated acceptance',async()=>{
 const response=await createBillingStagingEntry({fetch(){throw Error('must not delegate')}}).fetch(request('/api/billing-staging/status'),config().vars,{});
 const result=await response.json();assert.equal(result.sourceSha,inputs.BILLING_STAGING_SOURCE_SHA);assert.equal(result.authenticatedAcceptance,false);assert.equal(result.billingMutationsEnabled,false);
});
test('all staging responses use staging provenance instead of the production release',async()=>{
 const productionSha='b'.repeat(40);
 const entry=createBillingStagingEntry({async fetch(){return new Response('<html><head><script src="/js/api-client.js?v=production-'+productionSha+'"></script><meta name="thebe-assets-release" content="'+productionSha+'"></head></html>',{status:200,headers:{'content-type':'text/html','x-thebe-source-sha':productionSha,'x-thebe-release-sequence':'582','x-thebe-client-release':'production-'+productionSha}})}});
 for(const path of ['/app/','/api/billing-staging/status','/api/platform/regulatory/rules']){
  const response=await entry.fetch(request(path),{...config().vars,DB:qualifiedDb},{});
  assert.equal(response.headers.get('x-thebe-source-sha'),inputs.BILLING_STAGING_SOURCE_SHA);
  assert.equal(response.headers.get('x-thebe-release-sequence'),null);
  if(path==='/app/'){
   const html=await response.text();assert.match(html,new RegExp('thebe-assets-release" content="'+inputs.BILLING_STAGING_SOURCE_SHA));assert.doesNotMatch(html,new RegExp(productionSha));
   assert.match(response.headers.get('x-thebe-client-release'),/aaaaaaaaaaaa$/);
  }
 }
});
test('staging ready JSON does not claim the production release provenance',async()=>{
 const entry=createBillingStagingEntry({async fetch(){return Response.json({ok:false,provenance:{sourceSha:'b'.repeat(40),releaseSequence:582,release:'production'}},{status:503})}});
 for(const path of ['/api/ready','/__thebe_api/ready','/?__thebe_api_path=%2Fapi%2Fready']){
  const response=await entry.fetch(request(path),{...config().vars,DB:qualifiedDb},{});assert.equal(response.status,503);
  const body=await response.json();assert.equal(body.ok,false);assert.deepEqual(body.provenance,{release:'billing-staging-readonly',sourceSha:inputs.BILLING_STAGING_SOURCE_SHA,runtimeEntry:'billing-staging-entry',registrationMode:'hold'});
 }
});
test('production hostname and incomplete runtime are refused',async()=>{
 const entry=createBillingStagingEntry({fetch(){throw Error('must not delegate')}});
 assert.equal((await entry.fetch(new Request('https://thebedesk.com/api/live'),config().vars,{})).status,403);
 assert.equal((await entry.fetch(request('/api/live'),{},{})).status,503);
});
test('real downstream retains authentication and role enforcement on billing reads',async()=>{
 const response=await createBillingStagingEntry().fetch(request('/api/platform/billing/subscriptions'),{...config().vars,DB:{prepare(sql){assert.match(sql,/FROM billing_staging_identity/);return qualifiedDb.prepare(sql)}}},{});
 assert.equal(response.status,401);
});
test('unqualified or wrong database is refused before login writes',async()=>{
 const entry=createBillingStagingEntry({fetch(){throw Error('must not delegate')}});
 for(const DB of [undefined,{prepare(){throw Error('missing marker')}},{prepare(){return {first:async()=>({database_id:inputs.PRODUCTION_D1_DATABASE_ID,environment:'billing-staging'})}}}]){
  const response=await entry.fetch(request('/api/auth/login','POST'),{...config().vars,DB},{});
  assert.equal(response.status,503);assert.equal((await response.json()).error,'billing_staging_database_unqualified');
 }
});
test('marker SQL is additive staging-only metadata and refuses replay on an existing marker',()=>{
 const db=new DatabaseSync(':memory:');try{
  const sql=billingStagingMarkerSql(inputs);db.exec(sql);
  assert.deepEqual({...db.prepare('SELECT * FROM billing_staging_identity').get()},{id:1,database_id:inputs.BILLING_STAGING_D1_ID,environment:'billing-staging'});
  assert.throws(()=>db.exec(sql),/already exists/);
  assert.doesNotMatch(sql,/users|subscriptions|payment_orders|regulatory_rules|DROP|DELETE|UPDATE/);
 }finally{db.close()}
});
