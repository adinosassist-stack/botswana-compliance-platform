import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handlePrivateQuotationAuthRehearsal} from
 '../server/quotation-private-auth-rehearsal-worker.mjs';
const origin='https://quotation-rehearsal.internal.test';
const tenant='123e4567-e89b-42d3-a456-426614174000';
const user='22222222-2222-4222-8222-222222222222';
const caller='synthetic-internal-caller-secret-1234567890';
const hmac='synthetic-session-hmac-secret-not-production-123456';
const cookie='synthetic-session-cookie-rehearsal-123456';
const csrf='synthetic-csrf-value-for-rehearsal';
const hash=createHmac('sha256',hmac).update(cookie).digest('hex');
function fixture(){
 let active=true,role='owner',fresh=true;
 const AUTH_DB={prepare(sql){return {bind(...args){return {async first(){
   if(sql.includes('FROM sessions s')){
    if(args[0]!==hash||args[1]!==tenant||!active||!fresh)return null;
    return {user_id:user,tenant_id:tenant,role,csrf_token:csrf};
   }
   if(sql.includes('FROM memberships m')){
    if(args[0]!==tenant||args[1]!==user||!active)return null;
    return {user_id:user,tenant_id:tenant,role};
   }
   throw Error('unreviewed_query');
 }}}}}};
 const env={
  QUOTATION_PRIVATE_REHEARSAL_ENABLED:'synthetic-internal-only',
  QUOTATION_PRIVATE_REHEARSAL_ENVIRONMENT:'quotation-private-staging',
  QUOTATION_PRIVATE_REHEARSAL_ORIGIN:origin,
  QUOTATION_PRIVATE_REHEARSAL_TENANT_ID:tenant,
  QUOTATION_PRIVATE_REHEARSAL_CALLER_SECRET:caller,
  QUOTATION_PRIVATE_REHEARSAL_SESSION_SECRET:hmac,
  AUTH_DB
 };
 const request=(path='/rehearsal/synthetic',method='GET',extra={})=>
  new Request(origin+path,{method,headers:{
   'x-quotation-private-caller':caller,
   'cookie':'__Host-bw_session='+cookie,
   ...(method==='POST'?{'origin':origin,'x-csrf-token':csrf}:{}),
   ...extra
  }});
 return {env,request,disable:()=>{active=false},staff:()=>{role='staff'},
  stale:()=>{fresh=false}};
}
test('default and missing enable flag are inert',async()=>{
 const f=fixture();
 assert.equal((await handlePrivateQuotationAuthRehearsal(f.request(),{})).status,404);
 f.env.QUOTATION_PRIVATE_REHEARSAL_ENABLED='off';
 assert.equal((await handlePrivateQuotationAuthRehearsal(f.request(),f.env)).status,404);
});
test('internal caller and reserved virtual origin required',async()=>{
 const f=fixture();
 assert.equal((await handlePrivateQuotationAuthRehearsal(f.request(
  undefined,'GET',{'x-quotation-private-caller':'bad'}),f.env)).status,404);
 f.env.QUOTATION_PRIVATE_REHEARSAL_ORIGIN='https://thebedesk.com';
 assert.equal((await handlePrivateQuotationAuthRehearsal(f.request(),f.env)).status,404);
});
test('synthetic signed session passes read and CSRF-protected POST',async()=>{
 const f=fixture();
 assert.equal((await handlePrivateQuotationAuthRehearsal(
  f.request('/unexpected'),f.env)).status,404);
 const a=await handlePrivateQuotationAuthRehearsal(f.request(),f.env);
 assert.equal(a.status,200,await a.clone().text());
 assert.deepEqual(await a.json(),{ok:true,synthetic:true,role:'owner'});
 const b=await handlePrivateQuotationAuthRehearsal(
  f.request(undefined,'POST'),f.env);
 assert.equal(b.status,200,await b.clone().text());
});
test('invalid session, origin, csrf and methods denied',async()=>{
 const f=fixture();
 assert.equal((await handlePrivateQuotationAuthRehearsal(f.request(
  undefined,'GET',{cookie:''}),f.env)).status,401);
 assert.equal((await handlePrivateQuotationAuthRehearsal(f.request(
  undefined,'POST',{'origin':'https://wrong.internal.test'}),f.env)).status,403);
 assert.equal((await handlePrivateQuotationAuthRehearsal(f.request(
  undefined,'POST',{'x-csrf-token':'incorrect'}),f.env)).status,403);
 assert.equal((await handlePrivateQuotationAuthRehearsal(f.request(
  undefined,'DELETE'),f.env)).status,404);
});
test('staff write denial, revocation and stale session denied',async()=>{
 const f=fixture();f.staff();
 assert.equal((await handlePrivateQuotationAuthRehearsal(f.request(
  undefined,'POST'),f.env)).status,403);
 f.disable();
 assert.equal((await handlePrivateQuotationAuthRehearsal(f.request(),f.env)).status,401);
 const g=fixture();g.stale();
 assert.equal((await handlePrivateQuotationAuthRehearsal(g.request(),g.env)).status,401);
});
