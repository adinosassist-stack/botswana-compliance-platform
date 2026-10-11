import assert from "node:assert/strict";
import worker from "../cloudflare/src/worker.js";

const secret="review-role-isolation-secret-20261011-abcdefghijklmnopqrstuvwxyz";
const operationsSecret="review-operations-secret-20261011-abcdefghijklmnopqrstuvwxyz";
const origin="https://app.example";
const adminEmail="platform.owner@example.test";

async function hmacHex(secretValue,value){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secretValue),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

const sessions=new Map();
async function addSession(raw,role){
  sessions.set(await hmacHex(secret,raw),{
    user_id:`user-${role}`,tenant_id:"tenant-a",role,session_role:role,session_public_id:`session-${role}`,
    csrf_token:`csrf-${role}`,created_at:"2026-10-11T00:00:00Z",last_seen_at:new Date().toISOString(),expires_at:"2026-12-01T00:00:00Z",
    email:adminEmail,display_name:`${role} user`,onboarding_complete:1,tenant_name:"tenant-a"
  });
}
for(const role of ["owner","reviewer","auditor","employee"])await addSession(role,role);

class Statement{
  constructor(sql,bindings=[]){this.sql=String(sql);this.bindings=bindings}
  bind(...bindings){return new Statement(this.sql,bindings)}
  async first(){
    if(this.sql.includes("FROM sessions s JOIN users u"))return sessions.get(String(this.bindings[0]))||null;
    return null;
  }
  async all(){return {results:[]}}
  async run(){return {success:true,meta:{changes:1}}}
}
const env={
  DB:{prepare:sql=>new Statement(sql)},
  SESSION_SECRET:secret,
  PUBLIC_ORIGIN:origin,
  PUBLIC_APP_URL:origin,
  PLATFORM_ADMIN_EMAILS:adminEmail,
  OPERATIONS_SECRET:operationsSecret,
  ASSETS:{fetch:async()=>new Response("asset")}
};
const ctx={waitUntil(){}};

async function api(raw,path,{headers={}}={}){
  const response=await worker.fetch(new Request(origin+path,{headers:{cookie:`bw_session=${raw}`,origin,...headers}}),env,ctx);
  const data=await response.json().catch(()=>({}));
  return {status:response.status,data,text:JSON.stringify(data)};
}

const owner=await api("owner","/api/property/valuation-operations/status");
assert.equal(owner.status,200);
assert.equal(owner.data.sessionAllowed,true,"platform-admin owner must qualify for valuation operations");
assert.equal(owner.data.authority,"platform_admin_owner_only");
assert.equal(owner.data.secretExposed,false);
assert.doesNotMatch(owner.text,new RegExp(operationsSecret),"operations secret must never be exposed in the response");

for(const role of ["reviewer","auditor"]){
  const status=await api(role,"/api/property/valuation-operations/status");
  assert.equal(status.status,403,`${role} must not read owner-only valuation operations status`);
  assert.equal(status.data.error,"workspace_role_read_forbidden");

  const spoofed=await api(role,"/api/property/valuation-operations/professionals",{headers:{"x-operations-secret":operationsSecret}});
  assert.equal(spoofed.status,403,`${role} must not bypass role policy with an operations-secret header`);
  assert.equal(spoofed.data.error,"workspace_role_read_forbidden");
}

const employee=await api("employee","/api/property/valuation-operations/status");
assert.equal(employee.status,403,"employee session must not enter the workspace privileged surface");
assert.equal(employee.data.error,"workspace_role_forbidden");

const employeeSpoofed=await api("employee","/api/property/valuation-operations/professionals",{headers:{"x-operations-secret":operationsSecret}});
assert.equal(employeeSpoofed.status,403,"employee must not bypass workspace role policy with an operations-secret header");
assert.equal(employeeSpoofed.data.error,"workspace_role_forbidden");

const ownerWithoutAdminEmailRaw="owner-nonadmin";
sessions.set(await hmacHex(secret,ownerWithoutAdminEmailRaw),{
  ...sessions.get(await hmacHex(secret,"owner")),
  user_id:"user-owner-nonadmin",session_public_id:"session-owner-nonadmin",email:"ordinary.owner@example.test"
});
const nonAdminOwner=await api(ownerWithoutAdminEmailRaw,"/api/property/valuation-operations/status");
assert.equal(nonAdminOwner.status,200);
assert.equal(nonAdminOwner.data.sessionAllowed,false,"ordinary tenant owner must not inherit platform valuation authority");
assert.equal(nonAdminOwner.data.secretExposed,false);

console.log("V327 privileged role runtime isolation: owner-only valuation operations boundary PASS");
