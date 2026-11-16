import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuotationPrivateHostSessionGate} from '../server/quotation-private-host-session-gate.mjs';
const tenant='f00d46fb-a818-4605-93a0-2c9e30b6f57f';
const other='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';
const origin='https://quotation-private-staging.example.test';
function fixture(overrides={}) {
  const calls=[];
  const gate=createQuotationPrivateHostSessionGate({
    environment:'quotation-private-staging',enabled:true,
    expectedTenantId:tenant,allowedPrivateOrigin:origin,
    readVerifiedSession:async()=>({authenticated:true,tenantId:tenant,userId:user,role:'owner'}),
    verifyActiveMembership:async()=>({active:true,tenantId:tenant,userId:user,role:'owner'}),
    verifyMutation:async({request})=>request.headers.get('x-csrf-token')==='synthetic',
    quotationHandlers:{async handle(payload){calls.push(payload);return new Response('OK');}},
    ...overrides
  });
  const send=(path='/api/quotation/drafts',init={})=>gate.handle(new Request(origin+path,init));
  return {gate,calls,send};
}
test('disabled by default and refuses public origin',()=>{
  assert.throws(()=>createQuotationPrivateHostSessionGate(),/disabled/);
  assert.throws(()=>fixture({allowedPrivateOrigin:'https://thebedesk.com'}),/private_origin_required/);
  assert.throws(()=>fixture({allowedPrivateOrigin:'http://quotation-private-staging.example.test'}),/private_origin_required/);
  assert.throws(()=>fixture({allowedPrivateOrigin:'https://quotation.workers.dev'}),/private_origin_required/);
});
test('verified session and active membership derive tenant, never client fields',async()=>{
  const x=fixture();const response=await x.send('/api/quotation/drafts?companyId='+other);
  assert.equal(response.status,200);assert.equal(x.calls.length,1);
  assert.equal(x.calls[0].companyId,tenant);assert.equal(x.calls[0].actor.tenantId,tenant);
});
test('wrong tenant session fails before delegated handler',async()=>{
  const x=fixture({readVerifiedSession:async()=>({authenticated:true,userId:user,tenantId:other,role:'owner'})});
  assert.equal((await x.send()).status,401);assert.equal(x.calls.length,0);
});
test('invalid, missing and thrown session fail closed',async()=>{
  for(const readVerifiedSession of [async()=>null,async()=>({tenantId:tenant,userId:user,role:'owner'}),async()=>{throw Error('db down')}]) {
    const x=fixture({readVerifiedSession});assert.equal((await x.send()).status,401);assert.equal(x.calls.length,0);
  }
});
test('inactive, mismatched and unavailable membership fail closed',async()=>{
  for(const verifyActiveMembership of [async()=>({active:false,tenantId:tenant,userId:user,role:'owner'}),async()=>({active:true,tenantId:other,userId:user,role:'owner'}),async()=>{throw Error('db down')}]) {
    const x=fixture({verifyActiveMembership});assert.equal((await x.send()).status,403);assert.equal(x.calls.length,0);
  }
});
test('staff read permitted but write prohibited, independently of CSRF',async()=>{
  const x=fixture({readVerifiedSession:async()=>({authenticated:true,userId:user,tenantId:tenant,role:'staff'}),
    verifyActiveMembership:async()=>({active:true,userId:user,tenantId:tenant,role:'staff'})});
  assert.equal((await x.send()).status,200);
  const response=await x.send('/api/quotation/drafts',{method:'POST',headers:{origin,'x-csrf-token':'synthetic'}});
  assert.equal(response.status,403);assert.equal(x.calls.length,1);
});
test('mutation denies cross-origin and missing/invalid CSRF',async()=>{
  const x=fixture();
  const missing=await x.send('/api/quotation/drafts',{method:'POST',headers:{'x-csrf-token':'synthetic'}});
  const mismatched=await x.send('/api/quotation/drafts',{method:'POST',headers:{origin:'https://other.example','x-csrf-token':'synthetic'}});
  const noCsrf=await x.send('/api/quotation/drafts',{method:'POST',headers:{origin}});
  assert.equal(missing.status,403);assert.equal(mismatched.status,403);assert.equal(noCsrf.status,403);
  assert.equal(x.calls.length,0);
});
test('verified owner, origin and mutation token reach handler',async()=>{
  const x=fixture();const r=await x.send('/api/quotation/drafts',{method:'POST',headers:{origin,'x-csrf-token':'synthetic'}});
  assert.equal(r.status,200);assert.equal(x.calls.length,1);
  assert.equal(x.calls[0].actor.role,'owner');assert.equal(x.calls[0].companyId,tenant);
});
test('request to foreign host is denied even with verified session',async()=>{
  const x=fixture();const r=await x.gate.handle(new Request('https://thebedesk.com/api/quotation/drafts'));
  assert.equal(r.status,404);assert.equal(x.calls.length,0);
});
test('host handler failure never leaks details',async()=>{
  const x=fixture({quotationHandlers:{async handle(){throw Error('a secret')}}});
  const r=await x.send();assert.equal(r.status,500);assert.deepEqual(await r.json(),{ok:false,error:'quotation_handler_failed'});
});
