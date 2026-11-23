import test from 'node:test';
import assert from 'node:assert/strict';
import {handleThebeLifeMotsheloReadRoute as handle} from '../cloudflare/src/thebe-life-motshelo-read-route.js';
const origin='https://life.example.test',path='/api/life/motshelo/g1/summary';
const auth={user_id:'u1',session_verified:true,life_entitled:true};
const row={group_id:'g1',group_name:'Savings',group_model:'rotating',member_count:2,
  reported_minor:10000,matched_minor:5000,cleared_minor:2500};
const contribution={id:'c1',member_user_id:'u1',due_on:'2026-11-10',
  reported_minor:10000,matched_minor:5000,cleared_minor:2500,currency:'BWP'};
function env(summary=row,overrides={}){
  return {THEBE_LIFE_MOTSHELO_READ_ENABLED:'true',PUBLIC_ORIGIN:origin,
    LIFE_RATE_LIMITER:{limit:async()=>({success:true})},
    LIFE_DB:{prepare(sql){return {bind(){return {
      async first(){return summary;},
      async all(){return {results:[contribution]};}
    };}};}},...overrides};
}
const req=(p=path,method='GET',headers={})=>new Request(origin+p,{method,headers});
test('not mounted by default and denies unsafe methods',async()=>{
  assert.equal(await handle({request:req(),path:'/else',env:env(),auth}),null);
  assert.equal((await handle({request:req(path,'POST'),path,env:env(),auth})).status,405);
  assert.equal((await handle({request:req(),path,env:env(row,{THEBE_LIFE_MOTSHELO_READ_ENABLED:'false'}),auth})).status,404);
});
test('requires verified entitlement, origin and limiter',async()=>{
  assert.equal((await handle({request:req(),path,env:env(),auth:null})).status,401);
  assert.equal((await handle({request:req(),path,env:env(),auth:{...auth,life_entitled:false}})).status,403);
  assert.equal((await handle({request:req(path,'GET',{origin:'https://other.test'}),path,env:env(),auth})).status,403);
  assert.equal((await handle({request:req(path+'?user_id=u2'),path,env:env(),auth})).status,400);
  assert.equal((await handle({request:req(),path,env:env(row,{LIFE_RATE_LIMITER:null}),auth})).status,503);
});
test('authorized summary is no-store and never claims bank verification',async()=>{
  const res=await handle({request:req(),path,env:env(),auth});
  assert.equal(res.status,200);
  assert.equal(res.headers.get('cache-control'),'no-store');
  const result=await res.json();
  assert.equal(result.outstandingVerificationMinor,7500);
  assert.equal(result.bankVerified,false);
  assert.equal(result.availableToDisburseMinor,null);
});
test('revoked or missing group returns 404 for both summary and contributions',async()=>{
  for(const p of [path,'/api/life/motshelo/g1/contributions']){
    assert.equal((await handle({request:req(p),path:p,env:env(null),auth})).status,404);
  }
});
test('authorized history returns read-only records but no payment capability',async()=>{
  const p='/api/life/motshelo/g1/contributions';
  const res=await handle({request:req(p),path:p,env:env(),auth});
  assert.equal(res.status,200);
  const result=await res.json();
  assert.equal(result.records[0].bankVerified,false);
  assert.equal(result.paymentExecutionEnabled,false);
});
