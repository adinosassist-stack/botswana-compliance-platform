import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["risk events table",s.includes("business_risk_events")],
 ["event history",s.includes("business_risk_event_history")],
 ["risk snapshots",s.includes("business_risk_snapshots")],
 ["sync engine",w.includes("syncBusinessRiskEvents")],
 ["bounded cursor sweep",w.includes("risk_engine_state")&&w.includes("runRiskEventSweep(env,50)")],
 ["employment source",w.includes("employment_risk_findings")],
 ["obligation source",w.includes("obligation-overdue:")],
 ["licence source",w.includes("licence-expired:")],
 ["tender source",w.includes("tender-gap:")],
 ["risk API",w.includes("/api/business-risk-events")],
 ["next actions",w.includes('source:"risk"')],
 ["partner portfolio",w.includes("/api/partner/portfolio-risk")],
 ["partner entitlement gate",w.includes('requireEntitlement(env,a.tenant_id,"partner_portal")')],
 ["partner consent gate",w.includes('partnerAccess(env,a.tenant_id,clientTenantId,"read")')],
 ["sweep fault isolation",w.includes("let processed=0,failed=0,last=cursor")],
 ["risk UI",h.includes('id="riskengine"')],
 ["portfolio UI",h.includes('id="portfolioRisk"')],
 ["no prediction claim",h.includes("not legal predictions")]
];
const bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
