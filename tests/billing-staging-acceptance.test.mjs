import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {checkBillingStagingAcceptance} from '../scripts/check-billing-staging-acceptance.mjs';
import {renderBillingStagingConfig,billingStagingMarkerSql} from '../scripts/render-billing-staging-config.mjs';
import {prepareBillingStagingOwner} from '../scripts/prepare-billing-staging-owner.mjs';
import {prepareBillingStagingCustomers} from '../scripts/prepare-billing-staging-customers.mjs';
import {prepareBillingStagingPayments} from '../scripts/prepare-billing-staging-payments.mjs';
import staging from '../cloudflare/src/billing-staging-entry.js';

const inputs={BILLING_STAGING_D1_ID:'11111111-1111-4111-8111-111111111111',PRODUCTION_D1_DATABASE_ID:'22222222-2222-4222-8222-222222222222',BILLING_STAGING_SOURCE_SHA:'a'.repeat(40),BILLING_STAGING_ADMIN_EMAILS:'billing-owner@example.invalid'};
const passwords={owner:'Owner-staging-test-password!',alpha:'Alpha-staging-test-password!',beta:'Beta-staging-test-password!'};
const args={config:renderBillingStagingConfig(inputs),expectedDatabaseId:inputs.BILLING_STAGING_D1_ID,productionDatabaseId:inputs.PRODUCTION_D1_DATABASE_ID,sourceSha:inputs.BILLING_STAGING_SOURCE_SHA,ownerEmail:inputs.BILLING_STAGING_ADMIN_EMAILS,passwords};
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync('cloudflare/schema.sql','utf8'));db.exec(billingStagingMarkerSql(inputs));
 db.exec(prepareBillingStagingOwner({...args,email:args.ownerEmail,password:passwords.owner}).sql);
 db.exec(prepareBillingStagingCustomers({...args,alphaPassword:passwords.alpha,betaPassword:passwords.beta}).sql);
 db.exec(prepareBillingStagingPayments(args).sql);
 const DB={prepare(sql){let values=[];return {bind(...p){values=p;return this},async first(){return db.prepare(sql).get(...values)||null},async all(){return {results:db.prepare(sql).all(...values)}},async run(){return {meta:{changes:Number(db.prepare(sql).run(...values).changes)}}}}}};
 const env={...args.config.vars,DB,SESSION_SECRET:'acceptance-local-session-secret-'.repeat(3)};
 const requests=[];
 const fetchImpl=async(url,options)=>{requests.push({url,options});assert.equal(new URL(url).origin,args.config.vars.PUBLIC_ORIGIN);assert.equal(options.redirect,'error');return staging.fetch(new Request(url,options),env,{})};
 const snapshot=()=>JSON.stringify(Object.fromEntries(['users','tenants','memberships','subscriptions','app_state','payment_orders','manual_payment_submissions','manual_payment_events','payment_fulfillments','entitlement_overrides','platform_regulatory_principals'].map(t=>[t,db.prepare('SELECT * FROM '+t).all()])));
 return {db,env,requests,fetchImpl,snapshot};
}
async function altered(response,data,status=response.status){const headers=new Headers(response.headers);headers.delete('content-length');return Response.json(data,{status,headers})}

test('checker drives actual staging authentication, durable fixtures and isolation, then revokes all its sessions',async()=>{
 const f=fixture();try{
  const before=f.snapshot();const report=await checkBillingStagingAcceptance(args,{fetchImpl:f.fetchImpl});
  assert.equal(report.ok,true,JSON.stringify(report));assert.equal(report.cleanupComplete,true);assert.ok(report.checks.includes('owner_pending_queue'));assert.ok(report.checks.includes('beta_survives_alpha_logout'));assert.ok(report.checks.includes('final_identity'));
  assert.equal(f.snapshot(),before);assert.equal(f.db.prepare('SELECT count(*) n FROM sessions').get().n,0);
  for(const r of f.requests.filter(r=>r.options.method!=='GET'))assert.ok(['/api/auth/login','/api/auth/logout','/api/payments/manual-bank/pop/stage'].includes(new URL(r.url).pathname));
  const serialized=JSON.stringify(report);for(const secret of [...Object.values(passwords),'__Host-bw_session','csrfToken',args.ownerEmail,'bank_reference','tenantId'])assert.ok(!serialized.includes(secret));
  assert.ok(report.unverified.includes('browser-login-and-375px-layout'));
 }finally{f.db.close()}
});

for(const patch of [{sourceSha:'b'.repeat(40)},{expectedDatabaseId:inputs.PRODUCTION_D1_DATABASE_ID},{config:{...args.config,vars:{...args.config.vars,PUBLIC_ORIGIN:'https://thebedesk.com'}}},{passwords:{...passwords,beta:'bad\npassword-value'}}])test('invalid local authority refuses before any network request: '+Object.keys(patch),async()=>{
 let called=false;await assert.rejects(checkBillingStagingAcceptance({...args,...patch},{fetchImpl:async()=>{called=true;throw Error('must not send')}}));assert.equal(called,false);
});

for(const scenario of ['wrong-source','enabled-flag','redirect','network-secret','html'])test('bad initial response fails before sending a password: '+scenario,async()=>{
 const calls=[];const report=await checkBillingStagingAcceptance(args,{fetchImpl:async(url,options)=>{
  calls.push(options);if(scenario==='network-secret')throw Error(passwords.owner);
  const headers={'x-thebe-source-sha':scenario==='wrong-source'?'b'.repeat(40):args.sourceSha,'x-thebe-billing-staging':'read-only'};
  if(scenario==='redirect')return new Response(null,{status:302,headers:{...headers,location:'https://thebedesk.com'}});
  if(scenario==='html')return new Response(passwords.owner,{headers});
  return Response.json({mode:'read_only',sourceSha:args.sourceSha,authenticatedAcceptance:false,billingMutationsEnabled:scenario==='enabled-flag',popUploadsEnabled:false,regulatoryActivationEnabled:false},{headers});
 }});assert.equal(report.ok,false);assert.equal(calls.length,1);assert.equal(calls[0].body,undefined);assert.ok(!JSON.stringify(report).includes(passwords.owner));
});

for(const scenario of ['cross-tenant','platform-access','paid-order','queue-mismatch','receipt-total','logout-not-revoked'])test('checker detects a behavioral regression and reports a safe failure: '+scenario,async()=>{
 const f=fixture();let changed=false;try{
  const report=await checkBillingStagingAcceptance(args,{fetchImpl:async(url,options)=>{
   const r=await f.fetchImpl(url,options);const u=new URL(url);let data=await r.clone().json();
   if(scenario==='cross-tenant'&&u.pathname==='/api/state'&&u.search){data.state.billingStagingFixture='wrong';changed=true}
   else if(scenario==='platform-access'&&u.pathname==='/api/platform/billing/analytics'&&r.status===403){changed=true;return altered(r,{items:[]},200)}
   else if(scenario==='paid-order'&&u.pathname==='/api/payments/orders'){data.items[0].paid_at='2026-10-28';changed=true}
   else if(scenario==='queue-mismatch'&&u.pathname==='/api/platform/billing/manual-payments'&&r.status===200){data.items[0].tenant_id='wrong';changed=true}
   else if(scenario==='receipt-total'&&u.pathname==='/api/platform/billing/analytics'&&r.status===200){data.totalReceiptsBwp=698;changed=true}
   else if(scenario==='logout-not-revoked'&&u.pathname==='/api/auth/me'&&r.status===401){changed=true;return altered(r,{user:{email:'still-authenticated'}},200)}
   return altered(r,data);
  }});assert.equal(changed,true);assert.equal(report.ok,false);assert.ok(report.failedCheck);assert.equal(f.db.prepare('SELECT count(*) n FROM sessions').get().n,0);
  assert.equal(report.cleanupComplete,scenario!=='logout-not-revoked');assert.ok(!JSON.stringify(report).includes(passwords.owner));
 }finally{f.db.close()}
});

test('failed customer login revokes the owner session already created',async()=>{
 const f=fixture();try{const report=await checkBillingStagingAcceptance({...args,passwords:{...passwords,alpha:'Incorrect-staging-password!'}},{fetchImpl:f.fetchImpl});assert.equal(report.ok,false);assert.equal(report.failedCheck,'alpha_login');assert.equal(report.cleanupComplete,true);assert.equal(f.db.prepare('SELECT count(*) n FROM sessions').get().n,0)}finally{f.db.close()}
});

test('lost login CSRF response reports incomplete cleanup rather than claiming the session was revoked',async()=>{
 const f=fixture();try{
  const report=await checkBillingStagingAcceptance(args,{fetchImpl:async(url,options)=>{
   const r=await f.fetchImpl(url,options);if(new URL(url).pathname==='/api/auth/login')return altered(r,{user:{email:args.ownerEmail},csrfToken:''});return r;
  }});
  assert.equal(report.ok,false);assert.equal(report.cleanupComplete,false);assert.equal(report.failure,'acceptance_session_cleanup_failed');
  assert.equal(f.db.prepare('SELECT count(*) n FROM sessions').get().n,1);
  assert.ok(!JSON.stringify(report).includes('__Host-bw_session'));
 }finally{f.db.close()}
});

test('CLI refuses report overwrite and malformed credential input without echoing secrets',()=>{
 const dir=mkdtempSync(join(tmpdir(),'billing-acceptance-'));try{
  const config=join(dir,'config.json'),out=join(dir,'report.json');const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  writeFileSync(config,JSON.stringify(renderBillingStagingConfig({...inputs,BILLING_STAGING_SOURCE_SHA:sourceSha})));writeFileSync(out,'keep-existing');
  const cli=['scripts/check-billing-staging-acceptance.mjs','--config',config,'--owner-email',args.ownerEmail,'--database',args.expectedDatabaseId,'--out',out];
  for(const input of [Object.values(passwords).join('\n'),passwords.owner]){const r=spawnSync(process.execPath,cli,{encoding:'utf8',input,env:{...process.env,PRODUCTION_D1_DATABASE_ID:args.productionDatabaseId}});assert.equal(r.status,1);assert.equal(readFileSync(out,'utf8'),'keep-existing');assert.ok(!r.stderr.includes(passwords.owner))}
 }finally{rmSync(dir,{recursive:true,force:true})}
});
