import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["applicability",s.includes("company_rule_applicability")],
 ["obligations",s.includes("compliance_obligations")],
 ["evidence reqs",s.includes("obligation_evidence_requirements")],
 ["rollout runs",s.includes("regulatory_rollout_runs")],
 ["applicability engine",w.includes("evaluateRuleForTenant")],
 ["obligation creator",w.includes("createObligationsFromRule")],
 ["evidence completion gate",w.includes("mandatory_evidence_incomplete")],
 ["rollout endpoint",w.includes("/rollout")],
 ["next actions integration",w.includes('source:"regulatory"')],
 ["obligations UI",h.includes('id="obligations"')]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
