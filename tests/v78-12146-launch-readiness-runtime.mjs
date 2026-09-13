import fs from "node:fs";
import worker from "../cloudflare/src/worker.js";
import agenticWorker from "../cloudflare/src/agentic-entry.js";
const pkg=JSON.parse(fs.readFileSync(new URL("../package.json",import.meta.url),"utf8"));
const profile=JSON.parse(fs.readFileSync(new URL("../RELEASE_PROFILE.json",import.meta.url),"utf8"));
const CORE_SCHEMA_DELTA="046_v80_agentic_outcomes.sql";

class FakeStmt{
  constructor(sql,mode){this.sql=sql;this.mode=mode}
  bind(){return this}
  async first(){
    if(this.sql.includes("executive_control_replacement_governance") && this.mode==="core_stale") throw new Error("no such table");
    if(this.sql.includes("agent_delegations") && this.mode==="authority_stale") throw new Error("no such table");
    return {ok:1};
  }
}
class FakeDB{constructor(mode="current"){this.mode=mode} prepare(sql){return new FakeStmt(sql,this.mode)}}
const env=(mode)=>({
  DB:new FakeDB(mode),EVIDENCE:{},PUBLIC_RATE_LIMITER:{limit:async()=>({success:true})},PAYMENT_PROVIDER:"dpo",DEPLOYMENT_PROFILE:"workers-free-first",
  SESSION_SECRET:"s".repeat(48),AUDIT_INTEGRITY_SECRET:"a".repeat(48),OPERATIONS_SECRET:"o".repeat(48),AUTOMATION_SECRET:"m".repeat(48),TURNSTILE_SITE_KEY:"0x4AAAAAAAtestsitekey",TURNSTILE_SECRET_KEY:"t".repeat(48),
  EVIDENCE_SCAN_API_URL:"https://scanner.example/scan",EVIDENCE_SCAN_SECRET:"e".repeat(48),
  PLATFORM_ADMIN_EMAILS:"admin@example.org",PLATFORM_REGULATORY_REVIEWERS:"reviewer@example.org",
  PUBLIC_APP_URL:"https://app.example",PUBLIC_ORIGIN:"https://app.example",BILLING_WEBHOOK_SECRET:"b".repeat(48),PAYMENT_WEBHOOK_SECRET:"p".repeat(48),DPO_COMPANY_TOKEN:"d".repeat(24),DPO_SERVICE_TYPE:"service"
});
async function body(res){return await res.json()}

let res=await worker.fetch(new Request("https://app.example/api/ready"),env("core_stale"),{});let data=await body(res);
if(res.status!==503||data.error!=="schema_outdated"||data.schemaReady!==false||data.expectedSchemaDelta!==CORE_SCHEMA_DELTA)throw new Error("base Worker core schema must fail closed at migration 046");

res=await agenticWorker.fetch(new Request("https://app.example/api/ready"),env("authority_stale"),{});data=await body(res);
if(res.status!==503||data.error!=="schema_outdated"||data.schemaReady!==false||data.coreSchemaReady!==true||data.agenticAuthoritySchemaReady!==false||data.latestSchemaDelta!==profile.latest_cloudflare_migration)throw new Error("V81 authority schema must fail closed independently at migration 047");

res=await agenticWorker.fetch(new Request("https://app.example/api/ready"),env("current"),{});data=await body(res);
if(res.status!==200||data.ok!==true||data.schemaReady!==true||data.coreSchemaReady!==true||data.agenticAuthoritySchemaReady!==true||data.latestSchemaDelta!==profile.latest_cloudflare_migration||data.version!==`v78.${pkg.version}`)throw new Error("current core + V81 schemas with required config must be ready");
console.log("V78 1.21.46 launch readiness runtime: 3/3 PASS through V81 schema wrapper");
