import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import test from "node:test";
import {handleNamibiaInternalCandidate} from "../cloudflare/src/namibia-internal-api-candidate.js";
import {marketActivationReadiness} from "../cloudflare/src/market-profile.js";

const base="https://na-internal.example.test";
const schema=readFileSync(new URL("../proposals/namibia/001_compliance_candidate.sql",import.meta.url),"utf8");
const sessionSecret="isolated-test-only-session-secret";
const token="synthetic-session-cookie";
const csrf="synthetic-csrf";
const records={
  ownerA:{tenant_id:"synthetic-A",user_id:"owner-A",role:"owner",csrf_token:csrf},
  managerB:{tenant_id:"synthetic-B",user_id:"manager-B",role:"manager",csrf_token:csrf},
  auditor:{tenant_id:"synthetic-A",user_id:"auditor-A",role:"auditor",csrf_token:csrf},
  inactive:null
};

async function tokenHash(value){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(sessionSecret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const output=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
  return [...new Uint8Array(output)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function makeD1(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec(schema);
  let operations=0;
  const prepare=(sql)=>({
    bind(...params){
      const statement=sqlite.prepare(sql);
      const args=params.map(x=>x===undefined?null:x);
      return {
        first:async()=>{operations++;return statement.get(...args)||null},
        all:async()=>{operations++;return {results:statement.all(...args)}},
        run:()=>{operations++;return statement.run(...args)}
      };
    }
  });
  return {sqlite,prepare,async batch(statements){
    sqlite.exec("BEGIN IMMEDIATE");
    try{const results=statements.map(x=>x.run());sqlite.exec("COMMIT");return results}
    catch(error){sqlite.exec("ROLLBACK");throw error}
  },get operations(){return operations}};
}
function sessionDb(expectedHash,principal){
  let queries=0;
  return {
    prepare(sql){
      assert.match(sql,/JOIN memberships m/);
      assert.match(sql,/m.status='active'/);
      assert.match(sql,/s.session_generation=u.session_generation/);
      return {bind(hash){return {async first(){
        queries++;
        return hash===expectedHash ? principal : null;
      }}}};
    },
    get queries(){return queries}
  };
}
async function setup({principal=records.ownerA,allowlist="synthetic-A",enabled="1"}={}){
  const db=makeD1();
  const sessions=sessionDb(await tokenHash(token),principal);
  return {db,sessions,env:{
    NAMIBIA_INTERNAL_API_REHEARSAL_ENABLED:enabled,
    NAMIBIA_INTERNAL_API_MODE:"isolated_candidate",
    NA_CANDIDATE_TENANT_ALLOWLIST:allowlist,
    NA_CANDIDATE_DB:db,DB:sessions,SESSION_SECRET:sessionSecret,PUBLIC_ORIGIN:base
  },close(){db.sqlite.close()}};
}
function request(path,{method="GET",body,cookie=token,csrfValue=csrf,origin=base,contentType="application/json",extraHeaders={}}={}){
  const headers={...(cookie?{"cookie":"__Host-bw_session="+cookie}:{}),...(csrfValue?{"x-csrf-token":csrfValue}:{}),...(origin?{origin}:{}),...(body!==undefined?{"content-type":contentType}:{}) ,...extraHeaders};
  return new Request(base+path,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})});
}
async function send(env,path,options){
  const response=await handleNamibiaInternalCandidate(request(path,options),env);
  return {status:response.status,body:await response.json(),headers:response.headers};
}
const entity={entityRef:"SAMPLE-NA-1",entityType:"company",financialYearEnd:"2026-12-31"};
const evidence={entityRef:entity.entityRef,evidenceType:"entity_registration",label:"Registration certificate reference"};
const calendar={entityRef:entity.entityRef,taskType:"bipa_annual_return",title:"Annual return planning draft",planningDate:"2027-01-10",sourceUrl:"https://www.bipa.na/annual-duty/"};

test("HMAC session cookie authenticates owner and creates tenant-scoped audited records",async()=>{
  const c=await setup();
  try{
    assert.equal((await send(c.env,"/internal/namibia/entities",{method:"POST",body:entity})).status,201);
    assert.equal((await send(c.env,"/internal/namibia/evidence",{method:"POST",body:evidence})).status,201);
    assert.equal((await send(c.env,"/internal/namibia/calendar",{method:"POST",body:calendar})).status,201);
    const found=await send(c.env,"/internal/namibia/evidence?entityRef=SAMPLE-NA-1");
    assert.equal(found.status,200);assert.equal(found.body.length,1);
    const events=await send(c.env,"/internal/namibia/audit?entityRef=SAMPLE-NA-1");
    assert.equal(events.status,200);assert.equal(events.body.length,3);
    assert.equal(events.headers.get("cache-control"),"no-store");
    assert.equal(c.sessions.queries,5);
    assert.equal(marketActivationReadiness("NA").ready,false);
  }finally{c.close()}
});
test("auth, role and allowlist cannot be overridden by body, cookie or forged headers",async()=>{
  for(const principal of [records.auditor,records.inactive,records.managerB]){
    const c=await setup({principal});
    try{
      const result=await send(c.env,"/internal/namibia/entities",{method:"POST",body:{...entity,tenant_id:"synthetic-A",role:"owner"}});
      assert.equal(result.status,principal===null?401:403);
      assert.equal(c.db.operations,0);
    }finally{c.close()}
  }
  const c=await setup();
  try{
    assert.equal((await send(c.env,"/internal/namibia/entities",{method:"POST",body:entity,cookie:"forged"})).status,401);
    assert.equal((await send(c.env,"/internal/namibia/entities",{method:"POST",body:{...entity,tenant_id:"synthetic-B"}})).status,400);
    assert.equal((await send(c.env,"/internal/namibia/entities",{method:"POST",body:entity,extraHeaders:{"x-tenant-id":"synthetic-B"}})).status,201);
    const storedTenants=c.db.sqlite.prepare("SELECT DISTINCT tenant_id FROM na_compliance_entities").all();
    assert.deepEqual(storedTenants.map(x=>x.tenant_id),["synthetic-A"]);
  }finally{c.close()}
});
test("CSRF, cross-origin, malformed JSON, and unsupported methods fail closed",async()=>{
  const c=await setup();
  try{
    for(const [options,expected] of [
      [{method:"POST",body:entity,csrfValue:"bad"},403],
      [{method:"POST",body:entity,origin:"https://attacker.example"},403],
      [{method:"POST",body:entity,contentType:"text/plain"},415],
      [{method:"DELETE"},404],
    ]){
      const path=options.method==="DELETE"?"/internal/namibia/entities":"/internal/namibia/entities";
      assert.equal((await send(c.env,path,options)).status,expected);
    }
    assert.equal(c.db.operations,0);
    const unconfigured={...c.env,PUBLIC_ORIGIN:"not-a-valid-url"};
    assert.equal((await send(unconfigured,"/internal/namibia/evidence?entityRef=SAMPLE-NA-1")).status,503);
  }finally{c.close()}
});
test("same entity reference in two tenants does not permit cross-tenant read or mutation",async()=>{
  const db=makeD1();
  const expected=await tokenHash(token);
  try{
    for(const principal of [records.ownerA,records.managerB]){
      const env={NAMIBIA_INTERNAL_API_REHEARSAL_ENABLED:"1",NAMIBIA_INTERNAL_API_MODE:"isolated_candidate",
        NA_CANDIDATE_TENANT_ALLOWLIST:"synthetic-A,synthetic-B",NA_CANDIDATE_DB:db,
        DB:sessionDb(expected,principal),SESSION_SECRET:sessionSecret,PUBLIC_ORIGIN:base};
      assert.equal((await send(env,"/internal/namibia/entities",{method:"POST",body:entity})).status,201);
      if(principal===records.ownerA)assert.equal((await send(env,"/internal/namibia/evidence",{method:"POST",body:evidence})).status,201);
      const result=await send(env,"/internal/namibia/evidence?entityRef=SAMPLE-NA-1");
      assert.equal(result.status,200);
      assert.equal(result.body.length,principal===records.ownerA?1:0);
    }
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM na_compliance_entities").get().n,2);
  }finally{db.sqlite.close()}
});
