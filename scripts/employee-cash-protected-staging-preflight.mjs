/**
 * Employee Cash preflight: READ-ONLY staging inspection, no D1 migration or Worker upload.
 * Reuses the existing isolated employee environment's independent reviewer and
 * exact-main guards. Never print tokens, recovery bookmarks or customer data.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {verifyRemote,assertExactSource,ACCOUNT} from "./employee-self-service-protected-bootstrap-guard.mjs";
import {STAGING_D1} from "./employee-self-service-staging-preflight.mjs";

const MIGRATION=new URL("../cloudflare/migrations/20261118_employee_cash_reports.sql",import.meta.url);
const EXPECTED_TABLES=["employee_cash_entries","employee_cash_counts","employee_cash_events"];
const EXPECTED_TRIGGERS=["employee_cash_entries_tenant_guard","employee_cash_counts_tenant_guard","employee_cash_events_tenant_guard"];
export const PREFLIGHT_SCOPE="READ_ONLY_EMPLOYEE_CASH_STAGING_PREFLIGHT";

export function qualifyCashMigration(){
 const sql=readFileSync(MIGRATION,"utf8");
 for(const table of EXPECTED_TABLES){
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS "+table+"("),"missing required cash table "+table);
 }
 for(const trigger of EXPECTED_TRIGGERS){
  assert.ok(sql.includes("CREATE TRIGGER IF NOT EXISTS "+trigger),"missing required tenant guard "+trigger);
 }
 assert.ok(!sql.includes("8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"),"production D1 must not be referenced");
 assert.ok(sql.includes("PRAGMA foreign_keys=ON;"),"foreign-key safety must be explicit");
 return createHash("sha256").update(sql).digest("hex");
}

export function assertPreflightScope(env){
 assert.equal(env.DEPLOY_MODE,"preflight");
 assert.equal(env.AUTHORIZATION,"PREFLIGHT_ONLY");
 assert.equal(env.CASH_PREFLIGHT_SCOPE,PREFLIGHT_SCOPE);
 assertExactSource(env);
 return true;
}

export function assertCashStagingSchema(query,bookmark){
 assert.equal(query?.success,true,"staging D1 SQL unavailable");
 const batches=query?.result;
 assert.ok(Array.isArray(batches)&&batches.length===4,"D1 preflight must return exactly four read-only result sets");
 assert.ok(batches.every(b=>b?.success===true),"D1 result set failed");
 assert.equal((batches[0]?.results||[]).length,0,"cash schema already exists; do not retry an unknown migration");
 for(const [i,table,columns] of [
  [1,"employees",["id","tenant_id","status","full_name"]],
  [2,"tenants",["id"]],
  [3,"users",["id"]]
 ]){
  const present=new Set((batches[i]?.results||[]).map(x=>x.name));
  for(const col of columns)assert.ok(present.has(col),table+" missing required "+col);
 }
 assert.equal(bookmark?.success,true,"D1 recovery bookmark API unavailable");
 assert.equal(typeof bookmark?.result?.bookmark,"string","no D1 recovery bookmark");
 assert.ok(bookmark.result.bookmark.length>0,"empty D1 recovery bookmark");
 return true;
}

async function providerRead(method,path,token,body){
 const response=await fetch("https://api.cloudflare.com/client/v4"+path,{
  method,headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},
  body:body?JSON.stringify(body):undefined,redirect:"error",signal:AbortSignal.timeout(15000)
 });
 if(response.status!==200)throw Error("employee_cash_staging_provider_read_failed_"+response.status);
 const data=await response.json();
 if(data?.success!==true)throw Error("employee_cash_staging_provider_unsuccessful");
 return data;
}

export async function runCashStagingPreflight(env=process.env){
 assertPreflightScope(env);
 const sqlSha256=qualifyCashMigration();
 // Checks exactly-current main, protected environment policy (thusico, no bypass),
 // empty staging records and FK correctness, fixed staging identity and absent Worker.
 await verifyRemote(env);
 const token=env.STAFF_STAGING_CLOUDFLARE_TOKEN;
 if(typeof token!=="string"||!token)throw Error("staging_read_credentials_required");
 const base="/accounts/"+ACCOUNT+"/d1/database/"+STAGING_D1;
 const [query,bookmark]=await Promise.all([
  providerRead("POST",base+"/query",token,{sql:[
   "SELECT name,type FROM sqlite_master WHERE name LIKE 'employee_cash_%' ORDER BY name",
   "PRAGMA table_info(employees)",
   "PRAGMA table_info(tenants)",
   "PRAGMA table_info(users)"
  ].join(";")}),
  providerRead("GET",base+"/time_travel/bookmark",token)
 ]);
 assertCashStagingSchema(query,bookmark);
 // No bookmark value, SQL contents, customer data, or credentials in reports.
 console.log(JSON.stringify({
  result:"PASS",mode:"read_only_preflight",sourceSha:env.EXPECTED_MAIN_SHA,
  isolatedStagingD1:true,stagingHasCustomerRows:false,cashTablesPresent:false,
  stagingWorkerPresent:false,protectedReviewer:"thusico",
  recoveryBookmarkAvailable:true,migrationSha256:sqlSha256,
  sqlExecuted:false,productionWrites:false,stagingWrites:false
 }));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv[2]==="--offline")console.log(JSON.stringify({mode:"offline_only",migrationSha256:qualifyCashMigration()}));
  else if(process.argv[2]==="verify-remote")await runCashStagingPreflight();
  else throw Error("use_offline_or_verify_remote");
 }catch(error){
  console.error("Employee Cash preflight denied: "+String(error?.message||"unknown"));
  process.exitCode=1;
 }
}
