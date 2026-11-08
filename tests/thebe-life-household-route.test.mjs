import test from 'node:test';
import assert from 'node:assert/strict';
import {handleThebeLifeHouseholdRoute as handle} from '../cloudflare/src/thebe-life-household-route.js';
const path='/api/life/households/h1/entries';
const origin='https://example.test';
const auth={user_id:'user1',life_entitled:true,session_verified:true,csrf_token:'a'.repeat(32)};
function env(overrides={}){
  return {THEBE_LIFE_HOUSEHOLD_ENABLED:'true',PUBLIC_ORIGIN:origin,
    LIFE_RATE_LIMITER:{limit:async()=>({success:true})},
    LIFE_DB:{prepare(sql){return {bind(...params){return {
      async first(){return {role:'adult'};},
      async all(){return {results:[]};},
      async run(){return {meta:{changes:1}};}
    };}};}},...overrides};
}
const req=(method='GET',opts={})=>new Request(origin+path,{method,...opts});
const post=(body,headers={})=>req('POST',{headers:{origin,'x-csrf-token':auth.csrf_token,'content-type':'application/json',...headers},body:JSON.stringify(body)});
const entry={id:'t1',type:'expense',category:'Food',amountMinor:1000,currency:'BWP',occurredOn:'2026-11-08'};
test('unmatched routes are not registered',async()=>{assert.equal(await handle({request:req(),path:'/other',env:env(),auth}),null);});
test('disabled, unsigned and unentitled identities fail closed',async()=>{
  assert.equal((await handle({request:req(),path,env:env({THEBE_LIFE_HOUSEHOLD_ENABLED:'false'}),auth})).status,404);
  assert.equal((await handle({request:req(),path,env:env(),auth:null})).status,401);
  assert.equal((await handle({request:req(),path,env:env(),auth:{...auth,life_entitled:false}})).status,403);
});
test('authorized GET reads a household without mutations',async()=>{
  const response=await handle({request:req(),path,env:env(),auth});
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).entries,[]);
});
test('POST requires trusted Origin and CSRF and rejects extra fields',async()=>{
  const noOrigin=req('POST',{headers:{'content-type':'application/json'},body:JSON.stringify({entry})});
  assert.equal((await handle({request:noOrigin,path,env:env(),auth})).status,403);
  assert.equal((await handle({request:post({entry},{'x-csrf-token':'wrong'}),path,env:env(),auth})).status,403);
  assert.equal((await handle({request:post({entry,actorId:'forged'}),path,env:env(),auth})).status,400);
});
test('valid POST is a ledger record only; duplicate is never success',async()=>{
  const response=await handle({request:post({entry}),path,env:env(),auth});
  assert.equal(response.status,201);
  assert.equal((await response.json()).status,'recorded_not_bank_verified');
  const db=env().LIFE_DB;
  db.prepare=()=>({bind:()=>({run:async()=>({meta:{changes:0}})})});
  assert.equal((await handle({request:post({entry}),path,env:env({LIFE_DB:db}),auth})).status,409);
});
test('limiter and storage unavailable fail closed',async()=>{
  assert.equal((await handle({request:req(),path,env:env({LIFE_RATE_LIMITER:null}),auth})).status,503);
  assert.equal((await handle({request:req(),path,env:env({LIFE_DB:null}),auth})).status,503);
});
