import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEmployeeSelfServiceStagingEntry} from "../cloudflare/src/employee-self-service-staging-entry.js";
import {qualifyEmployeeStagingConfig,employeeStagingIdentitySql,STAGING_D1} from "../scripts/employee-self-service-staging-preflight.mjs";

const worker=createEmployeeSelfServiceStagingEntry();
const ORIGIN="https://employee-isolated.invalid";
const SHA="b".repeat(40);
const makeDb=({marker=true,tables=5,throws=false}={})=>({
 prepare(sql){
  if(throws)throw Error("isolated database unavailable");
  if(sql.includes("employee_self_service_staging_identity"))
   return {first:async()=>marker?{database_id:STAGING_D1,environment:"employee-self-service-isolated"}:null};
  if(sql.includes("sqlite_master"))
   return {first:async()=>({n:tables})};
  throw Error("unexpected query: "+sql);
 }
});
function env(overrides={}){
 return {APP_ENV:"staging",DEPLOYMENT_PROFILE:"employee-self-service-isolated",STAFF_STAGING_SOURCE_SHA:SHA,
  STAFF_STAGING_D1_ID:STAGING_D1,THEBE_STAFF_PORTAL_ENABLED:"false",STAFF_STAGING_WRITES_ENABLED:"false",
  REGISTRATION_MODE:"hold",PAYMENT_PROVIDER:"none",DB:makeDb(),...overrides};
}
function call(path="/api/employee-self-service-staging/status",options={},bindings=env()){
 return worker.fetch(new Request(ORIGIN+path,options),bindings);
}

test("review-only wrangler config is pinned, route-free and default-off",()=>{
 const evidence=qualifyEmployeeStagingConfig();
 assert.equal(evidence.database,STAGING_D1);
 assert.equal(evidence.enabled,false);
 assert.equal(evidence.routes,0);
 assert.equal(evidence.sourceQualified,false);
 const toml=readFileSync(new URL("../cloudflare/wrangler.employee-self-service-staging.toml",import.meta.url),"utf8");
 assert.doesNotMatch(toml,/^\[\[routes\]\]/m);
 assert.doesNotMatch(toml,/^(\[assets\]|\[triggers\])/m);
 assert.doesNotMatch(toml,/^workers_dev = true$/m);
 assert.doesNotMatch(toml,/^preview_urls = true$/m);
});
test("identity marker SQL targets only the isolated D1 and contains no customer data",()=>{
 const sql=employeeStagingIdentitySql();
 assert.match(sql,/employee_self_service_staging_identity/);
 assert.ok(sql.includes(STAGING_D1));
 assert.doesNotMatch(sql,/8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce|INSERT INTO (?:tenants|employees|users)/);
});
test("inert Worker returns only status and never allows staff login or management routes",async()=>{
 const okay=await call();
 assert.equal(okay.status,200);
 assert.equal(okay.headers.get("cache-control"),"no-store");
 assert.equal(okay.headers.get("x-thebe-employee-staging"),"inert");
 assert.equal(okay.headers.get("x-robots-tag"),"noindex, nofollow");
 const data=await okay.json();
 assert.equal(data.sourceSha,SHA);
 assert.equal(data.employeeLoginsEnabled,false);
 assert.equal(data.employeeWritesEnabled,false);
 assert.equal(data.customerActivation,false);
 for(const [path,method] of [
  ["/public/employee/login","POST"],
  ["/public/employee/me","GET"],
  ["/public/employee/tasks","GET"],
  ["/api/employee-self-service/tasks","POST"],
  ["/api/auth/login","POST"],
  ["/api/employee-self-service-staging/status","POST"],
  ["/api/employee-self-service-staging/status?debug=1","GET"]
 ]){
  const response=await call(path,{method},env());
  assert.equal(response.status,403,path+" "+method);
 }
});
test("staging Worker cannot be armed by changing employee or write enable flags",async()=>{
 for(const changed of [
  {THEBE_STAFF_PORTAL_ENABLED:"true"},
  {STAFF_STAGING_WRITES_ENABLED:"true"},
  {APP_ENV:"production"},
  {DEPLOYMENT_PROFILE:"production"},
  {STAFF_STAGING_SOURCE_SHA:"UNQUALIFIED"},
  {STAFF_STAGING_SOURCE_SHA:"0".repeat(39)},
  {STAFF_STAGING_D1_ID:"8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"},
  {REGISTRATION_MODE:"open"},
  {PAYMENT_PROVIDER:"online"},
  {DB:null}
 ]){
  const res=await call(undefined,{},env(changed));
  assert.equal(res.status,503,JSON.stringify(changed));
  assert.equal((await res.json()).error,"employee_staging_configuration_unqualified");
 }
});
test("missing or incorrect D1 identity, schema or D1 connectivity always fails closed",async()=>{
 for(const binding of [
  makeDb({marker:false}),
  makeDb({tables:4}),
  makeDb({throws:true}),
  {prepare(){return {first:async()=>({database_id:"8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce",environment:"production"})}}}
 ]){
  const response=await call(undefined,{},env({DB:binding}));
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,"employee_staging_database_unqualified");
 }
});
test("no production delegated runtime is imported or configured",()=>{
 const worker=readFileSync(new URL("../cloudflare/src/employee-self-service-staging-entry.js",import.meta.url),"utf8");
 assert.doesNotMatch(worker,/import\s+.*(?:worker|governance|staffPublic|staffManager)/i);
 assert.doesNotMatch(worker,/THEBE_STAFF_PORTAL_ENABLED!=="true"/);
 assert.match(worker,/employee_staging_route_disabled/);
});

test("production and employee staging stay isolated across customer-facing feature switches",()=>{
 const prod=readFileSync(new URL("../cloudflare/wrangler.toml",import.meta.url),"utf8");
 const staging=readFileSync(new URL("../cloudflare/wrangler.employee-self-service-staging.toml",import.meta.url),"utf8");
 for(const [key,value] of Object.entries({
  THEBE_STAFF_PORTAL_ENABLED:"false",STAFF_STAGING_WRITES_ENABLED:"false",
  THEBE_GENERAL_AI_ENABLED:"false",THEBE_AI_EXPORTS_ENABLED:"false",
  THEBE_LIVE_VOICE_ENABLED:"false",POP_UPLOAD_STAGING_ENABLED:"false",
  PAYMENT_PROVIDER:"none"
 })){
  assert.match(staging,new RegExp("^"+key+" = \\""+value+"\\"$","m"),key+" must remain isolated");
 }
 assert.match(prod,/^name = "bw-compliance-os"$/m);
 assert.match(staging,/^name = "bw-employee-self-service-staging"$/m);
 assert.match(staging,/^STAFF_STAGING_SOURCE_SHA = "UNQUALIFIED"$/m);
 assert.doesNotMatch(staging,/^\[\[routes\]\]|^\[assets\]|^\[triggers\]/m);
 assert.doesNotMatch(staging,/^database_name = "bw-compliance-os"$/m);
});
