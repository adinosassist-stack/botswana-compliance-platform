import assert from "node:assert/strict";
import fs from "node:fs";
import worker from "../cloudflare/src/worker.js";

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const workerSource=read("cloudflare/src/worker.js");
const html=read("public/index.html");
const launch=read("docs/LAUNCH.md");
const security=read("docs/SECURITY.md");
const backup=read("docs/BACKUP_RESTORE.md");
const cloudflareReadme=read("cloudflare/README.md");
const wrangler=read("cloudflare/wrangler.toml");
const pkg=JSON.parse(read("package.json"));
const profile=JSON.parse(read("RELEASE_PROFILE.json"));

class ThrowingD1{
  constructor(message){this.message=message}
  prepare(){const message=this.message;return {bind(){return this},first(){throw new Error(message)},all(){throw new Error(message)},run(){throw new Error(message)}}}
}
const quotaRead="Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.";
const quotaWrite="Your account has exceeded D1's free tier daily row write limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.";

let response=await worker.fetch(new Request("https://app.example/api/ready"),{DB:new ThrowingD1(quotaRead),PUBLIC_ORIGIN:"https://app.example"},{});
assert.equal(response.status,503);assert.equal((await response.clone().json()).error,"database_daily_limit_reached");assert.ok(Number(response.headers.get("retry-after"))>=60);
assert.doesNotMatch(await response.text(),/Upgrade to a paid plan|row read limit/i);

response=await worker.fetch(new Request("https://app.example/api/auth/register",{method:"POST",headers:{origin:"https://app.example","content-type":"application/json"},body:JSON.stringify({email:"owner@example.com",password:"12345678901",companyName:"Acme"})}),{DB:new ThrowingD1("DB should not be called"),PUBLIC_ORIGIN:"https://app.example"},{});
assert.equal(response.status,400);assert.equal((await response.json()).error,"invalid_registration");

response=await worker.fetch(new Request("https://app.example/api/auth/password-reset/complete",{method:"POST",headers:{origin:"https://app.example","content-type":"application/json"},body:JSON.stringify({token:"token",password:"12345678901"})}),{DB:new ThrowingD1("DB should not be called"),PUBLIC_ORIGIN:"https://app.example"},{});
assert.equal(response.status,400);assert.equal((await response.json()).error,"invalid_reset");

response=await worker.fetch(new Request("https://app.example/api/auth/register",{method:"POST",headers:{origin:"https://app.example","content-type":"application/json"},body:JSON.stringify({email:"owner@example.com",password:"123456789012",companyName:"Acme"})}),{DB:new ThrowingD1(quotaWrite),PUBLIC_ORIGIN:"https://app.example",APP_ENV:"development"},{});
assert.equal(response.status,503);let body=await response.json();assert.equal(body.error,"database_daily_limit_reached");assert.ok(Number(response.headers.get("retry-after"))>=60);

response=await worker.fetch(new Request("https://app.example/api/auth/register",{method:"POST",headers:{origin:"https://app.example","content-type":"application/json"},body:JSON.stringify({email:"owner@example.com",password:"123456789012",companyName:"Acme"})}),{DB:new ThrowingD1("database provider internal secret=do-not-leak"),PUBLIC_ORIGIN:"https://app.example",APP_ENV:"development"},{});
assert.equal(response.status,500);const bounded=await response.text();assert.match(bounded,/request_failed/);assert.doesNotMatch(bounded,/do-not-leak|provider internal/i);

const checks=[
  ["v78 simplification release",Number(pkg.version.split(".")[2]||0)>=3],
  ["dependency exact pin",pkg.dependencies["cookie-parser"]==="1.4.7"],
  ["12–200 char worker password policy",workerSource.includes("const PASSWORD_MIN_CHARS=12")&&workerSource.includes("const PASSWORD_MAX_CHARS=200")&&workerSource.includes("validPasswordLength")],
  ["12-char UI reset policy",(html.match(/minlength="12"/g)||[]).length>=2&&!html.includes('minlength="10"')&&html.includes("at least 12 characters")],
  ["copilot reference readability",html.includes(".copilot-ref{")&&html.includes("padding:6px 9px;font-size:13px")&&html.includes("color:#52615a;font-size:13px")],
  ["bounded D1 quota response",workerSource.includes("database_daily_limit_reached")&&workerSource.includes('"retry-after"')&&workerSource.includes("d1DailyQuotaExceeded")],
  ["free-first wrangler profile",wrangler.includes('DEPLOYMENT_PROFILE = "workers-free-first"')],
  ["free-first release profile",profile.deployment_profile==="cloudflare-workers-free-first"&&profile.cloudflare_monthly_target_bwp===0&&profile.cloudflare_base_usd_per_month===0],
  ["D1 ceilings recorded",profile.d1_rows_read_daily_limit===5000000&&profile.d1_rows_written_daily_limit===100000&&profile.workers_free_requests_daily_limit===100000],
  ["VAT conflict fails closed",profile.vat_threshold_automation_blocked===true&&profile.burs_vat_compulsory_threshold_bwp===null&&profile.burs_vat_threshold_status==="authoritative_burs_source_conflict_fail_closed"],
  ["Cloudflare primary launch docs",launch.includes("primary v78 public launch path is Cloudflare Worker + D1 + R2")&&launch.includes("Do not provision PostgreSQL merely to launch the Cloudflare profile")],
  ["security profile aligned",security.includes("D1 is the primary relational store")&&security.includes("12-character minimum")],
  ["backup profile aligned",backup.includes("Primary Cloudflare profile")&&backup.includes("both D1 metadata/state and R2 evidence bytes")],
  ["D1 enforcement documented",cloudflareReadme.includes("D1 now enforces its daily read/write limits")&&cloudflareReadme.includes("5 million D1 rows read/day")],
  ["sidebar owns its scroll region",html.includes('id="v78-sidebar-navigation-overlap-fix"')&&html.includes('aside>.nav{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important')],
  ["sidebar footer cannot overlay navigation",html.includes('aside>.sidebarfoot{flex:0 0 auto!important;position:relative!important;z-index:3!important')&&html.includes('aside>.sidebarfoot span{display:block!important')],
  ["large sidebar groups default collapsed",(html.match(/<details class="nav-access-group">/g)||[]).length>=6&&!/<details class="nav-access-group"[^>]*\sopen(?:\s|>)/.test(html)],
  ["business event scenarios defined",html.includes("const businessEvents={")&&["premises","ownership","activity","hire","tax","manufacture","data"].every(k=>html.includes(`${k}:{title:`))],
  ["public plan storage fails soft",html.includes("function safeSessionGet(key)")&&html.includes("function safeSessionSet(key,value)")&&!html.includes('selectedPublicPlan=plan;sessionStorage.setItem("bwcos_selected_plan",plan)')]
];
const failed=checks.filter(([,ok])=>!ok);for(const [name,ok] of checks)console.log(`${ok?"PASS":"FAIL"} ${name}`);if(failed.length)process.exit(1);
console.log("PASS runtime D1 daily-quota boundary, password-policy alignment, release-profile truth and Cloudflare launch-doc integrity");
