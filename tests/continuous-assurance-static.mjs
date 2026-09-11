import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["assurance runs",s.includes("control_assurance_runs")],
 ["assurance results",s.includes("control_assurance_results")],
 ["freshness fields",s.includes("assurance_freshness")&&s.includes("last_human_review_at")],
 ["auto vs human separation",w.includes("last_auto_checked_at=CURRENT_TIMESTAMP")&&!w.includes("ON CONFLICT(tenant_id,control_key) DO UPDATE SET status=excluded.status,assurance_level=excluded.assurance_level,due_at=excluded.due_at,\\n      last_tested_at=CURRENT_TIMESTAMP,next_review_at=excluded.next_review_at")],
 ["freshness engine",w.includes("controlFreshness")],
 ["rule change stale",w.includes("mapped published regulatory rule changed")],
 ["stale evidence",w.includes("Linked evidence is no longer current and approved")],
 ["human review endpoint",w.includes("/review$/)&&req.method===\"POST\"")],
 ["rule mapped no override",w.includes("rule_mapped_status_is_system_controlled")],
 ["bounded sweep",w.includes("runContinuousAssuranceSweep(env,25)")],
 ["freshness UI",h.includes('id="assurancefreshness"')],
 ["auto does not reset copy",h.includes("Automatic checks do not reset human review dates")],
 ["review cannot cure stale evidence",w.includes("Underlying evidence remains expired or missing after review")]
];
const bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
