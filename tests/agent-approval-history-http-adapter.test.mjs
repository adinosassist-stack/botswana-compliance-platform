import test from "node:test";
import assert from "node:assert/strict";
import {handleAgentApprovalHistoryHttp as handle} from "../server/agent-approval-history-http-adapter.js";
const principal={authenticated:true,tenantId:"tenant-a",actorId:"owner-a",actorRole:"owner"};
const guards=Object.fromEntries(["verifySession","verifyTenantMembership","verifyOrigin","checkRateLimit","verifyAuditAvailability"].map(x=>[x,async()=>true]));
const pool={async query(){return {rows:[]};}};
const base={request:{method:"GET"},principal,guards,pool,featureEnabled:true};
test("default off and no guards fail without querying",async()=>{
 assert.equal((await handle({...base,featureEnabled:false})).status,404);
 assert.equal((await handle({...base,guards:null})).status,503);
 assert.equal((await handle({...base,request:{method:"POST"}})).status,405);
});
test("all mandatory security gates required before read",async()=>{
 const expectations={verifySession:401,verifyTenantMembership:403,verifyOrigin:403,checkRateLimit:429,verifyAuditAvailability:503};
 for(const [name,status] of Object.entries(expectations)){
  let queried=false;const denied={...guards,[name]:async()=>false};
  const r=await handle({...base,guards:denied,pool:{async query(){queried=true;return {rows:[]};}}});
  assert.equal(r.status,status);assert.equal(queried,false);
 }
});
test("approved read remains inert and read-only",async()=>{
 const r=await handle(base);assert.equal(r.status,200);assert.equal(r.body.ok,true);assert.equal(r.body.readOnly,true);
 assert.deepEqual(r.body.items,[]);
});
test("guard errors and unauthenticated access fail closed",async()=>{
 assert.equal((await handle({...base,principal:{...principal,authenticated:false}})).status,401);
 assert.equal((await handle({...base,guards:{...guards,verifySession:async()=>{throw Error("offline");}}})).status,503);
});

test("kill switch and missing identity always prevent storage access",async()=>{
 let queries=0;
 const guardedPool={async query(){queries++;return {rows:[]};}};
 const cases=[{killSwitch:true},{principal:null},{principal:{...principal,authenticated:false}},{featureEnabled:false},{request:{method:"DELETE"}}];
 for(const overrides of cases){const result=await handle({...base,pool:guardedPool,...overrides});assert.notEqual(result.status,200);assert.equal(result.body.readOnly,true);assert.deepEqual(result.body.items,[]);}
 assert.equal(queries,0);
});
test("missing any individual security callback blocks all reads",async()=>{
 for(const name of Object.keys(guards)){
  let queries=0;const incomplete={...guards};delete incomplete[name];
  const result=await handle({...base,guards:incomplete,pool:{async query(){queries++;return {rows:[]};}}});
  assert.equal(result.status,503);assert.equal(result.body.code,"security_guards_unavailable");assert.equal(queries,0);
 }
});
