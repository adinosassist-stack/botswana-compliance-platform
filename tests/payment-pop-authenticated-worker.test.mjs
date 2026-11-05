import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import entry from '../cloudflare/src/payment-pop-http-staging-entry.js';
import {popServiceFixture,popFixtureId as id} from './helpers/payment-pop-service-fixture.mjs';
const origin='https://pop-staging.thebedesk.com',raw='local-fixture-session-token',secret='local-independent-session-secret-'.repeat(2);
function fixture(){
 const f=popServiceFixture(),hash=createHmac('sha256',secret).update(raw).digest('hex');
 f.sql.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,role,csrf_token,expires_at,last_seen_at) VALUES(?,?,?,'owner','local-csrf',datetime('now','+1 hour'),CURRENT_TIMESTAMP)").run(hash,id,id);
 Object.assign(f.env,{APP_ENV:'staging',DEPLOYMENT_PROFILE:'pop-http-staging',PUBLIC_ORIGIN:origin,PUBLIC_APP_URL:origin,POP_HTTP_STAGING_D1_ID:'812f9021-890b-41e6-8fa1-6001f90a9b53',POP_HTTP_STAGING_SOURCE_SHA:'a'.repeat(40),POP_HTTP_STAGING_ENABLED:'true',SESSION_SECRET:secret,PLATFORM_ADMIN_EMAILS:'platform@example.invalid'});
 const request=(path,options={})=>new Request(origin+path,{...options,headers:{cookie:'__Host-bw_session='+raw,origin,'x-csrf-token':'local-csrf',...options.headers}});
 return {...f,request};
}
test('actual Worker derives customer identity; forged platform privilege never grants receipt listing',async()=>{
 const f=fixture();try{
  const identity=await entry.fetch(f.request('/api/auth/me'),f.env,{});assert.equal(identity.status,200);const data=await identity.json();
  assert.equal(data.user.tenantId,id);assert.equal(data.user.platformBillingAdmin,false);
  const denied=await entry.fetch(f.request('/api/platform/billing/pop/receipts?orderId='+id,{headers:{'x-platform-owner':'true'}}),f.env,{});
  assert.equal(denied.status,403);
 }finally{f.close()}
});
test('actual Worker session revocation/expiry and CSRF reject before receipt mutations',async()=>{
 const f=fixture();try{
  const path='/api/payments/manual-bank/pop/upload';
  const denied=await entry.fetch(f.request(path,{method:'POST',headers:{'x-csrf-token':'wrong'}}),f.env,{});assert.equal(denied.status,403);
  f.sql.prepare('UPDATE users SET session_generation=session_generation+1').run();
  assert.equal((await entry.fetch(f.request('/api/auth/me'),f.env,{})).status,401);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM payment_pop_documents').get().n,0);
 }finally{f.close()}
});
test('actual Worker permits platform list only from the server email allowlist',async()=>{
 const f=fixture();try{
  f.sql.prepare("UPDATE users SET email='platform@example.invalid'").run();
  const response=await entry.fetch(f.request('/api/platform/billing/pop/receipts?orderId='+id),f.env,{});
  assert.equal(response.status,200);assert.deepEqual((await response.json()).items,[]);
 }finally{f.close()}
});
