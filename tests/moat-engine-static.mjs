import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["employee controls schema",s.includes("employee_risk_controls")],
 ["employment findings",s.includes("employment_risk_findings")],
 ["employment snapshots",s.includes("employment_risk_snapshots")],
 ["protection snapshots",s.includes("business_protection_snapshots")],
 ["employer engine",w.includes("computeEmployerRisk")],
 ["protection score",w.includes("computeBusinessProtectionScore")],
 ["fixed term process flag",w.includes("fixed_term_basis_missing")],
 ["professional review driver",w.includes("professional_review_required")],
 ["control API",w.includes("risk-controls")],
 ["employee create",w.includes("EMPLOYEE_CREATED")],
 ["app state typo fixed",!w.includes("FROM tenant_state")],
 ["protection UI",h.includes('id="protectionengine"')],
 ["reg obligations repaired",h.includes('id="regulatoryobligations"')],
 ["no duplicate async obligations",(h.match(/async function renderObligations\(/g)||[]).length===0],
 ["operational obligations renamed",h.includes("async function renderComplianceObligations(")]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
