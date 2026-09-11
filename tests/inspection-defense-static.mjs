import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["scenario library",s.includes("inspection_scenario_library")],
 ["six scenarios",(s.match(/Readiness','/g)||[]).length>=3&&s.includes("burs-tax-records")&&s.includes("employment-labour")&&s.includes("client-due-diligence")],
 ["simulation runs",s.includes("inspection_simulation_runs")&&s.includes("inspection_simulation_findings")],
 ["readiness not prediction",s.includes("Readiness simulation only")&&h.includes("Readiness score, not enforcement probability")],
 ["uses control freshness",w.includes("assurance_freshness")&&w.includes("evidence_health")],
 ["uses obligations",w.includes("compliance_obligations")&&w.includes("prefixSql")],
 ["uses risk events",w.includes("business_risk_events")],
 ["uses HR cases",w.includes("includes_hr_cases")&&w.includes("Open HR case")],
 ["coverage fail safe",w.includes("Readiness coverage is insufficient")&&w.includes('coverage==="insufficient"?0')],
 ["limited coverage cap",w.includes('coverage==="limited"?Math.min(70,baseScore)')],
 ["finding dedupe",w.includes("uniqueFindings")],
 ["inspection entitlement",s.includes("'inspection_simulator'")&&w.includes('requireEntitlement(env,a.tenant_id,"inspection_simulator")')],
 ["inspection reads role gated",w.includes('roleAllowed(a,"owner","manager","reviewer","auditor")')],
 ["insufficient pack not ready",w.includes('sim.coverageStatus==="insufficient"?"stale":"ready"')],
 ["case evidence links",s.includes("hr_case_evidence_links")&&w.includes("approved_clean_evidence_required")],
 ["HR evidence namespace",w.includes("/api\\/hr\\/cases")||w.includes("/api/hr/cases")],
 ["HR linked evidence read",w.includes("l.evidence_id,l.relationship,l.linked_at")],
 ["defense reads role gated",w.includes('"/api/defense-packs"&&req.method==="GET"')&&w.includes('requireEntitlement(env,a.tenant_id,"dispute_defense_pack")')],
 ["defense pack",s.includes("dispute_defense_packs")&&w.includes("buildEmploymentDefensePack")],
 ["explicit evidence only",w.includes("hr_case_evidence_links l JOIN evidence e")],
 ["defense disclaimer",w.includes("does not determine whether an employment decision was lawful")],
 ["audit simulation",w.includes("INSPECTION_SIMULATION_RUN")],
 ["audit defense pack",w.includes("EMPLOYMENT_DEFENSE_PACK_ASSEMBLED")],
 ["UI simulator",h.includes("Inspection & Due-Diligence Simulator")&&h.includes("runInspectionScenario")],
 ["UI defense",h.includes("Employment Defense Packs")&&h.includes("createEmploymentDefensePack")],
 ["UI explicit evidence linking",h.includes('id="defenseEvidenceSelect"')&&h.includes("linkDefenseEvidence")],
 ["single simulation pack flow",!h.includes('apiJson("/api/inspection-simulations/run",{method:"POST"')],
 ["runtime current",/version:"v(?:60|6[1-9]|[7-9][0-9])",runtime:"cloudflare-worker"/.test(w)]
];
const bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
