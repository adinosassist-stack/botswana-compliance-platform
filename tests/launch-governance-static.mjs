import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const envExample=fs.readFileSync(new URL("../.env.example",import.meta.url),"utf8");
const wrangler=fs.readFileSync(new URL("../cloudflare/wrangler.toml",import.meta.url),"utf8");

const qStart=w.indexOf("const BOTSWANA_UTC_OFFSET_MINUTES=120;");
const qEnd=w.indexOf("function nextRetryAt",qStart);
const quietBlock=w.slice(qStart,qEnd);
const quietFns=new Function(`${quietBlock};return {inQuietHours,nextQuietHoursEndUtc,validQuietClock}`)();
const pref={quiet_hours_start:"20:00",quiet_hours_end:"07:00",timezone:"Africa/Gaborone"};
const evening=new Date("2026-08-31T18:30:00Z"); // 20:30 Botswana
const morning=new Date("2026-08-31T04:30:00Z"); // 06:30 Botswana
const daytime=new Date("2026-08-31T10:00:00Z"); // 12:00 Botswana

const checks=[
 ["review tables",s.includes("regulatory_source_reviews")&&s.includes("regulatory_rule_reviews")],
 ["rule route awaits platform auth",w.includes("const access=await requirePlatformRegulatory(a,env,...required)")],
 ["source review notes required",w.includes('["approved","rejected","conflict"].includes(status)&&notes.length<10')],
 ["source maker checker",w.includes("src.submitted_by_user_id===a.user_id")&&w.includes("maker_checker_required")],
 ["rule approval notes required",w.includes('if(notes.length<10)return json({error:"review_notes_required"},400)')],
 ["rule maker checker",w.includes("row.created_by_user_id===a.user_id")],
 ["source fingerprint",w.includes("regulatorySourceFingerprint")&&s.includes("source_fingerprint TEXT NOT NULL")],
 ["publish approval record gate",w.includes("approval_review_record_required")&&w.includes("rule_changed_after_approval")&&w.includes("sources_changed_after_approval")],
 ["publish and rollout batch",w.includes("INSERT INTO regulatory_rollout_runs")&&w.includes("await env.DB.batch(stmts)")],
 ["Botswana quiet timezone column",s.includes("timezone TEXT NOT NULL DEFAULT 'Africa/Gaborone'")],
 ["Botswana quiet evening",quietFns.inQuietHours(pref,evening)===true],
 ["Botswana quiet morning",quietFns.inQuietHours(pref,morning)===true],
 ["Botswana quiet daytime",quietFns.inQuietHours(pref,daytime)===false],
 ["Botswana quiet exact end",quietFns.nextQuietHoursEndUtc(pref,evening)==="2026-09-01T05:00:30.000Z"&&quietFns.nextQuietHoursEndUtc(pref,morning)==="2026-08-31T05:00:30.000Z"],
 ["quiet clock validation",quietFns.validQuietClock("23:59")&&!quietFns.validQuietClock("24:00")&&!quietFns.validQuietClock("7:00")],
 ["quiet preference timezone validation",w.includes('unsupported_timezone')&&w.includes('quiet_hours_invalid_hhmm')],
 ["quiet defer until end",w.includes("nextQuietHoursEndUtc(pref)||nextRetryAt(attemptNo)")],
 ["UI Botswana quiet copy",h.includes("Botswana time (Africa/Gaborone)")],
 ["dedicated audit secret",w.includes("env.AUDIT_INTEGRITY_SECRET")&&!w.includes("env.AUDIT_INTEGRITY_SECRET||env.SESSION_SECRET")],
 ["env audit secret newline fixed",envExample.includes("\nAUDIT_INTEGRITY_SECRET=")&&!envExample.includes("\\nAUDIT_INTEGRITY_SECRET")],
 ["env readiness variables documented",envExample.includes("PUBLIC_APP_URL=")&&envExample.includes("BILLING_WEBHOOK_SECRET=")&&envExample.includes("DPO_COMPANY_TOKEN=")&&envExample.includes("DPO_SERVICE_TYPE=")],
 ["deployment readiness helper",w.includes("function deploymentReadiness")&&w.includes("missingRequired")],
 ["strong secret validation",w.includes("function strongSecret")&&w.includes("changeme|placeholder")],
 ["payment readiness required",w.includes('{key:"BILLING_WEBHOOK_SECRET",required:true')&&w.includes('required:provider==="dpo"')],
 ["https public app required",w.includes('function validPublicAppUrl(value){') && w.includes('u.protocol==="https:"&&!u.username&&!u.password') && w.includes('configured:!!validPublicAppUrl(env.PUBLIC_APP_URL)')],
 ["ready endpoint config gate",w.includes('error:"configuration_incomplete"')&&w.includes("requiredConfigReady:false")],
 ["public readiness does not leak missing names",!w.includes("requiredConfigReady:config.ready,missingRequired:config.missingRequired")],
 ["admin readiness endpoint",w.includes("/api/platform/deployment-readiness")],
 ["wrangler audit required",wrangler.includes("required; no SESSION_SECRET fallback")],
 ["runtime current",/version:"v(?:64|6[5-9]|[7-9][0-9])",runtime:"cloudflare-worker"/.test(w)]
];
const bad=checks.filter(x=>!x[1]);
for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);
if(bad.length)process.exit(1);
