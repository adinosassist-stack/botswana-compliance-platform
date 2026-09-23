import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const m=fs.readFileSync(new URL("../cloudflare/migrations/017_v75_bw_market_commercial_hardening.sql",import.meta.url),"utf8");
const p=JSON.parse(fs.readFileSync(new URL("../cloudflare/seeds/botswana-foundation-pack-v1.json",import.meta.url),"utf8"));
const vatConflict=p.conflicts.find(x=>x.key==="vat-registration-threshold");
const payeConflict=p.conflicts.find(x=>x.key==="paye-itw8-salary-threshold");
const checks=[
 ["v75+ runtime",/version:"v(?:7[5-9]|[89][0-9])",runtime:"cloudflare-worker"/.test(w)],
 ["public plan prices",w.includes('PLAN_PRICE_BWP={starter:149,business:349,pro:699,network:1299,partner:2499}')],
 ["self serve boundary",w.includes('SELF_SERVE_PLAN_IDS=new Set(["starter","business","pro","network"])')&&w.includes('partner_plan_requires_assisted_onboarding')],
 ["verified checkout only",w.includes('direct_plan_change_disabled_use_verified_checkout')&&w.includes('/api/payments/subscription-checkout')],
 ["annual ten-for-twelve",w.includes('billingCycle==="annual"?10:1')&&w.includes('periodMonths:months')&&w.includes('periodModifier=`+${periodMonths} months`')],
 ["daily ops entitlement",w.includes('url.pathname.startsWith("/api/daily-reporting/")')&&w.includes('const reportingSetupPath=url.pathname==="/api/daily-reporting/locations"||url.pathname==="/api/daily-reporting/access"||url.pathname==="/api/daily-reporting/dashboard"')&&w.includes('const featureKey=reportingSetupPath?"operating_locations":"daily_operations"')&&w.includes("requireEntitlement(env,a.tenant_id,featureKey)")&&((w.match(/entitlement\(env,access\.tenant_id,"operating_locations"\)/g)||[]).length===2)],
 ["location plan limit",w.includes('location_plan_limit_reached')&&m.includes("('network','operating_locations',1,25)")],
 ["partner client limit",w.includes('partner_client_plan_limit_reached')&&m.includes("('network','partner_portal',1,5)")&&m.includes("('partner','partner_portal',1,20)")],
 ["AI packs repriced",s.includes("'AI50',50,59")&&s.includes("'AI150',150,149")&&s.includes("'AI500',500,399")],
 ["services repriced",s.includes("'TENDER_REVIEW'")&&s.includes("'ASSISTED_SETUP'")&&m.includes("base_price_bwp=2500 WHERE sku='COMPLIANCE_AUDIT'")],
 ["five public plans",h.includes('>Monitor</h3>')&&h.includes('>Protect</h3>')&&h.includes('>Control</h3>')&&h.includes('>Network</h3>')&&h.includes('>Partner</h3>')&&h.includes('P2,499 <small>/ month</small>')],
 ["annual pricing copy",h.includes('two months free')&&h.includes('id="billingCycleSelect"')],
 ["BW readiness view",h.includes('id="bwreadiness"')&&(h.includes('BW Readiness')||h.includes('>Business Readiness</h2>'))&&h.includes('Employment-law transition reviewed')&&h.includes('PPRA / e-procurement readiness reviewed')],
 ["CIPA Jan Dec exception",h.includes('if(m===0)m=1;else if(m===11)m=10')&&h.includes('P500 annual return')],
 ["VAT threshold fail closed",!p.rules.some(x=>x.key==="vat-compulsory-threshold-1m")&&vatConflict?.status==="open"&&String(vatConflict?.resolutionNotes||"").includes('Automated compulsory-registration threshold execution is disabled')],
 ["PAYE threshold fail closed",!p.rules.some(x=>x.key==="paye-itw8-threshold-2500")&&payeConflict?.status==="open"&&String(payeConflict?.resolutionNotes||"").includes('automated registration-threshold execution is disabled')],
 ["2026 transition sources",p.sources.some(x=>x.key==="botswana-tax-reform-2026")&&p.sources.some(x=>x.key==="botswana-egp-procurement-2026")&&p.sources.some(x=>x.key==="burs-tax-administration-act-2026")],
 ["professional services tax-agent boundary",h.includes("Tax-service delivery boundary verified")&&h.includes("registered tax agent")],
 ["mobile reporter share",h.includes("shareOpsReporterLink()")&&h.includes("https://wa.me/?text=")],
 ["no reporter localStorage persistence",!h.includes('dailyReporterDraftKey')&&!h.includes('bw_daily_report_draft')&&h.includes('Sensitive report text is not persisted in browser storage')],
 ["reporter plan gate after downgrade",w.includes('daily_reporting_not_in_active_plan')],
 ["network plan in schema",s.includes("('network','core_compliance',1,NULL)")&&s.includes("('network','daily_operations',1,1)")],
 ["notification transport truthfulness",h.includes("WhatsApp utility reminders activate only after")&&h.includes("SMS remains disabled")]
];
const bad=checks.filter(x=>!x[1]);
for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);
if(bad.length)process.exit(1);
