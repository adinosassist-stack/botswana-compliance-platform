import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {createSignupConversionStagingEntry} from '../cloudflare/src/signup-conversion-staging-entry.js';
import {SIGNUP_STAGING_ORIGIN as origin,SIGNUP_STAGING_PROFILE,SIGNUP_STAGING_EMAILS,signupStagingIdentity} from '../cloudflare/src/signup-conversion-staging-policy.js';
import {renderSignupStagingConfig,signupStagingMarkerSql} from '../scripts/render-signup-conversion-staging-config.mjs';
import {installShadowTelemetrySchema,sqliteTelemetryEnv} from './helpers/agent-shadow-telemetry.mjs';

const inputs={SIGNUP_STAGING_D1_ID:'11111111-1111-4111-8111-111111111111',PRODUCTION_D1_DATABASE_ID:'22222222-2222-4222-8222-222222222222',BILLING_STAGING_D1_ID:'33333333-3333-4333-8333-333333333333',REGULATORY_STAGING_D1_ID:'44444444-4444-4444-8444-444444444444',SIGNUP_STAGING_SOURCE_SHA:'a'.repeat(40)};
const variables=()=>renderSignupStagingConfig(inputs).vars;
const markerDb={prepare(){return {first:async()=>({database_id:inputs.SIGNUP_STAGING_D1_ID,environment:SIGNUP_STAGING_PROFILE})}}};
const req=(path,method='GET',body={})=>new Request(origin+path,{method,headers:{origin,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
const aliases=path=>[path,'/__thebe_api/'+path.slice(5),'/?__thebe_api_path='+encodeURIComponent(path)];

test('configuration has a dedicated target and no storage, AI, queue or scheduled bindings',()=>{
  const c=renderSignupStagingConfig({...inputs,PUBLIC_ORIGIN:'https://thebedesk.com',PAYMENT_PROVIDER:'dpo'});
  assert.equal(c.name,'bw-signup-conversion-staging');assert.equal(c.vars.PUBLIC_ORIGIN,origin);
  assert.equal(c.d1_databases[0].database_name,'bw-signup-conversion-staging');
  assert.equal(c.workers_dev,false);assert.equal(c.preview_urls,false);assert.equal(c.keep_vars,false);
  for(const field of ['r2_buckets','ai','queues','triggers'])assert.equal(c[field],undefined);
  assert.equal(c.ratelimits[0].name,'PUBLIC_RATE_LIMITER');
  const db=new DatabaseSync(':memory:');
  try{db.exec(signupStagingMarkerSql(inputs));assert.throws(()=>db.exec(signupStagingMarkerSql(inputs)),/already exists/)}finally{db.close()}
});
test('database identities and exact source are mandatory; production and existing staging targets are rejected',()=>{
  for(const key of Object.keys(inputs))assert.throws(()=>signupStagingIdentity({...inputs,[key]:''}),/signup_staging_/);
  for(const id of [inputs.PRODUCTION_D1_DATABASE_ID,inputs.BILLING_STAGING_D1_ID,inputs.REGULATORY_STAGING_D1_ID,'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce','20c0d37e-552e-438f-a56d-3f12c27d38e2'])assert.throws(()=>signupStagingIdentity({...inputs,SIGNUP_STAGING_D1_ID:id}),/forbidden/);
});
test('wrong profile, origin or database marker never delegates',async()=>{
  const entry=createSignupConversionStagingEntry({fetch(){assert.fail('unsafe delegation')}});
  const good={...variables(),DB:markerDb};
  for(const env of [{...good,APP_ENV:'production'},{...good,PUBLIC_ORIGIN:'https://thebedesk.com'},{...good,DB:{prepare(){throw Error('missing')}}},{...good,DB:{prepare(){return {first:()=>({database_id:inputs.PRODUCTION_D1_DATABASE_ID,environment:SIGNUP_STAGING_PROFILE})}}}}])assert.equal((await entry.fetch(req('/api/auth/login','POST',{email:SIGNUP_STAGING_EMAILS[0]}),env,{})).status,503);
  assert.equal((await entry.fetch(new Request('https://thebedesk.com/auth/'),good,{})).status,403);
});
test('payment, regulatory, employee and unrelated writes and unsafe reads stay denied across transports',async()=>{
  const entry=createSignupConversionStagingEntry({fetch(){assert.fail('forbidden route delegated')}}),env={...variables(),DB:markerDb};
  for(const path of ['/api/platform/billing/manual-payments/x/approve','/api/payments/manual-bank/pop/stage','/api/platform/regulatory/rules/approve','/api/agentic/tasks','/api/state','/api/account/delete'])for(const alias of aliases(path))assert.equal((await entry.fetch(req(alias,'POST'),env,{})).status,403);
  for(const path of ['/api/payments/return','/api/platform/billing/analytics','/api/platform/regulatory/rules','/api/unknown'])for(const alias of aliases(path))assert.equal((await entry.fetch(req(alias),env,{})).status,403);
  assert.equal((await entry.fetch(req('/public/employee-report','POST'),env,{})).status,403);
  assert.equal(entry.scheduled,undefined);
});
test('synthetic login body survives; production-owner login and integration credentials are excluded',async()=>{
  const entry=createSignupConversionStagingEntry({async fetch(request,env){
    assert.equal((await request.json()).email,SIGNUP_STAGING_EMAILS[0]);
    assert.equal(env.REGISTRATION_MODE,'cohort');assert.equal(env.REGISTRATION_COHORT_EMAILS_SECRET,SIGNUP_STAGING_EMAILS.join(','));
    for(const key of ['EVIDENCE','AI','OPENAI_API_KEY','RESEND_API_KEY','OPERATIONS_SECRET','AUTOMATION_SECRET','TURNSTILE_SECRET_KEY','POP_SCAN_SECRET'])assert.equal(env[key],undefined);
    assert.equal(env.PAYMENT_PROVIDER,'none');assert.equal(env.POP_UPLOAD_STAGING_ENABLED,'false');
    return Response.json({ok:true});
  }});
  const env={...variables(),DB:markerDb,AI:{},OPENAI_API_KEY:'not-forwarded',RESEND_API_KEY:'not-forwarded',PAYMENT_PROVIDER:'dpo'};
  for(const path of aliases('/api/auth/login'))assert.equal((await entry.fetch(req(path,'POST',{email:SIGNUP_STAGING_EMAILS[0]}),env,{})).status,200);
  assert.equal((await entry.fetch(req('/api/auth/login','POST',{email:'thebedesk@gmail.com'}),env,{})).status,403);
});
test('status and response provenance never assert production or authenticated acceptance',async()=>{
  const entry=createSignupConversionStagingEntry({fetch:async()=>Response.json({ok:false,provenance:{release:'production',sourceSha:'b'.repeat(40)}},{status:503,headers:{'x-thebe-release-sequence':'584','x-thebe-source-sha':'b'.repeat(40)}})});
  const env={...variables(),DB:markerDb};
  const status=await entry.fetch(req('/api/signup-staging/status'),env,{});
  assert.equal((await status.json()).authenticatedAcceptance,false);
  const ready=await entry.fetch(req('/api/ready'),env,{});
  assert.equal(ready.status,503);assert.equal(ready.headers.get('x-thebe-release-sequence'),null);
  assert.equal((await ready.json()).provenance.sourceSha,inputs.SIGNUP_STAGING_SOURCE_SHA);
});

async function solve(challenge){
  const encoder=new TextEncoder();
  for(let counter=0;counter<=500000;counter++){
    const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(`${challenge.token}:${counter}`)));
    let remaining=challenge.difficulty,valid=true;
    for(const byte of bytes){if(remaining<=0)break;const take=Math.min(8,remaining);if(byte>>(8-take)){valid=false;break}remaining-=take}
    if(valid)return JSON.stringify({challenge:challenge.token,counter,honeypot:''});
  }
  throw Error('proof_not_found');
}
test('real isolated schema permits only fixture signup, truthful conversion and fixture login',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    installShadowTelemetrySchema(db);db.exec(signupStagingMarkerSql(inputs));
    const {DB}=sqliteTelemetryEnv(db);
    DB.batch=statements=>{db.exec('BEGIN IMMEDIATE');try{const rows=statements.map(s=>s.run());db.exec('COMMIT');return rows}catch(error){db.exec('ROLLBACK');throw error}};
    const env={...variables(),DB,SESSION_SECRET:'isolated-signup-test-session-secret-0123456789',AUDIT_INTEGRITY_SECRET:'isolated-signup-test-audit-secret-0123456789',PUBLIC_RATE_LIMITER:{limit:async()=>({success:true})}};
    const entry=createSignupConversionStagingEntry();
    const register=async(email,conversionId)=>{
      const challenge=await entry.fetch(req('/api/auth/registration-proof/challenge','POST'),env,{});
      assert.equal(challenge.status,200);
      const request=req('/api/auth/register','POST',{email,password:'Synthetic-Signup-Regression!2026',companyName:'Isolated signup fixture',plan:'business',turnstileToken:await solve(await challenge.json())});
      request.headers.set('cookie','thebe_cv='+conversionId);
      return entry.fetch(request,env,{});
    };
    const first=await register(SIGNUP_STAGING_EMAILS[0],'signup-fixture-first-12345678');
    assert.equal(first.status,202);const generic=await first.json();
    const duplicate=await register(SIGNUP_STAGING_EMAILS[0],'signup-fixture-existing-12345678');
    assert.equal(duplicate.status,202);assert.deepEqual(await duplicate.json(),generic);
    assert.equal(db.prepare("SELECT count(*) n FROM audit_events WHERE event_type='MARKETING_REGISTRATION_SUCCESS'").get().n,1);
    assert.equal(db.prepare('SELECT count(*) n FROM users').get().n,1);
    const rejected=await entry.fetch(req('/api/auth/register','POST',{email:'outside@example.invalid'}),env,{});
    assert.equal(rejected.status,403);
    const login=await entry.fetch(req('/api/auth/login','POST',{email:SIGNUP_STAGING_EMAILS[0],password:'Synthetic-Signup-Regression!2026'}),env,{});
    assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/bw_session=/);
    const firstCookie=login.headers.get('set-cookie').match(/(?:__Host-)?bw_session=[^;]+/)[0];
    const second=await register(SIGNUP_STAGING_EMAILS[1],'signup-fixture-second-12345678');
    assert.equal(second.status,202);
    const secondLogin=await entry.fetch(req('/api/auth/login','POST',{email:SIGNUP_STAGING_EMAILS[1],password:'Synthetic-Signup-Regression!2026'}),env,{});
    assert.equal(secondLogin.status,200);
    const secondCookie=secondLogin.headers.get('set-cookie').match(/(?:__Host-)?bw_session=[^;]+/)[0];
    const identities=[];
    for(const cookie of [firstCookie,secondCookie]){
      const me=await entry.fetch(new Request(origin+'/api/auth/me',{headers:{cookie}}),env,{});
      assert.equal(me.status,200);identities.push((await me.json()).user);
    }
    assert.equal(identities[0].email,SIGNUP_STAGING_EMAILS[0]);assert.equal(identities[1].email,SIGNUP_STAGING_EMAILS[1]);
    assert.notEqual(identities[0].tenantId,identities[1].tenantId);
    for(const [index,cookie] of [firstCookie,secondCookie].entries()){
      const me=await entry.fetch(new Request(origin+'/api/auth/me?tenantId='+identities[1-index].tenantId,{headers:{cookie,'x-tenant-id':identities[1-index].tenantId}}),env,{});
      assert.equal((await me.json()).user.tenantId,identities[index].tenantId,'caller-supplied tenant cannot override the session');
    }
    assert.equal(db.prepare("SELECT count(*) n FROM audit_events WHERE event_type='MARKETING_REGISTRATION_SUCCESS'").get().n,2);
    assert.equal(db.prepare("SELECT count(*) n FROM users WHERE email='thebedesk@gmail.com'").get().n,0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{db.close()}
});
