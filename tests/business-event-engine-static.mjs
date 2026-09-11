import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["event tables",s.includes("business_events")&&s.includes("business_event_effects")&&s.includes("business_event_failures")],
 ["impact map table",s.includes("business_event_impacts")],
 ["event dedupe",s.includes("UNIQUE(tenant_id,event_key)")&&w.includes("deduplicated:true")],
 ["atomic event capture",w.includes("await env.DB.batch(stmts)")],
 ["profile diff",w.includes("detectProfileBusinessEvents")&&w.includes("profile_vat_status_changed")&&w.includes("profile_manufacturing_changed")],
 ["profile save coalesced",w.includes('eventType:"profile_material_change"')&&w.includes('eventKey:`profile:${next}:material`')],
 ["sensitive financial minimization",w.includes("valueChanged=true")&&w.includes("highestMonthlyEmployeePay")],
 ["employee hook",w.includes('eventType:"employee_hired"')],
 ["tender hook",w.includes('eventType:"tender_started"')],
 ["licence hook",w.includes('eventType:"licence_created"')&&w.includes('eventType:"licence_renewed"')],
 ["regulatory chunk",w.includes("status='published' AND id>? ORDER BY id LIMIT 100")],
 ["regulatory impact map",w.includes('"regulatory_rule",rule.id')],
 ["statutory impact map",w.includes("captureStatutoryEventImpacts")],
 ["control impact map",w.includes("captureControlEventImpacts")],
 ["risk impact map",w.includes("captureRiskEventImpacts")],
 ["statutory effect",w.includes("runStatutoryDeadlineEngine")],
 ["industry effect",w.includes("recommendIndustryPacks")],
 ["assurance effect",w.includes("syncAssurancePlane")],
 ["risk effect",w.includes("syncBusinessRiskEvents")],
 ["inspection invalidation",w.includes("UPDATE inspection_packs SET status='stale'")],
 ["passport invalidation",w.includes("UPDATE passport_verifications SET status='review'")],
 ["queued retry",w.includes("processQueuedBusinessEvents(env,20)")],
 ["no automatic failed retry storm",w.includes("status IN ('queued','partial') ORDER BY created_at")&&!w.includes("status IN ('queued','partial','failed') ORDER BY created_at")],
 ["stale processing recovery",w.includes("recovered_after_stale_processing")&&w.includes("'-10 minutes'")],
 ["manual report doesn't mutate status",h.includes("does not itself change legal status")],
 ["event UI",h.includes('id="businessevents"')&&h.includes("Report & recheck")],
 ["impact UI",h.includes("Impact Map")&&h.includes("viewBusinessEvent")],
 ["runtime current",/version:"v(?:61|6[2-9]|[7-9][0-9])",runtime:"cloudflare-worker"/.test(w)]
];
const bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
