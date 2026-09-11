import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["control library",s.includes("CREATE TABLE IF NOT EXISTS control_library")],
 ["tenant controls",s.includes("tenant_control_status")],
 ["control evidence",s.includes("control_evidence_links")],
 ["remediation",s.includes("remediation_cases")&&w.includes("/api/remediation")],
 ["reg change cases",s.includes("regulatory_change_cases")&&w.includes("/api/regulatory-change-cases")],
 ["evidence health",s.includes("evidence_health_snapshots")&&w.includes("computeEvidenceHealth")],
 ["evidence validity",s.includes("ALTER TABLE evidence ADD COLUMN valid_until")&&w.includes("/validity")],
 ["approved control evidence gate",w.includes("evidence_not_approved")],
 ["rule mapped self attest gate",w.includes("rule_mapped_control_requires_rule_evaluation")],
 ["regulatory published gate",w.includes("r.status='published'")],
 ["implementation obligation gate",w.includes("open_obligations_remain")],
 ["remediation source gate",w.includes("source_risk_still_open")],
 ["owner accepted risk",w.includes("owner_required_to_accept_risk")],
 ["professional escalation",w.includes("recommendedServiceSku")&&w.includes("/escalate")],
 ["bounded assurance sweep",w.includes("runAssuranceSweep(env,25)")],
 ["control center ui",h.includes('id="controlcenter"')],
 ["operational legal boundary",h.includes("Operational controls do not become legal requirements")],
 ["no customer payment bypass",w.includes("operations_transition_required")&&!w.includes('awaiting_payment:["paid","canceled"]')],
 ["ops professional workflow",w.includes("x-operations-secret")&&w.includes("OPERATIONS_STATUS_CHANGED")],
 ["risk acceptance reason",w.includes("risk_acceptance_reason_required")&&s.includes("risk_acceptance_reason TEXT")],
 ["reg dismissal gate",w.includes("applicable_change_cannot_be_dismissed")&&w.includes("dismissal_reason_required")],
 ["remediation audit",w.includes("REMEDIATION_STATUS_CHANGED")],
 ["empty evidence not green",w.includes("const established=approved>0")],
 ["source absence not passing",w.includes("sourceCounts?.licences")&&w.includes("sourceCounts?.employees")]
];
const bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
