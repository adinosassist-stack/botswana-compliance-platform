import fs from "node:fs";
const s=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const schema=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const checks=[
 ["cost controls",schema.includes("ai_cost_controls")],
 ["provider costs",schema.includes("ai_provider_costs")],
 ["spend guard",s.includes("checkAiSpendGuard")],
 ["partner fallback",s.includes("consumePartnerPoolIfAvailable")],
 ["cost control endpoint",s.includes("/api/ai/cost-control")],
 ["provider cost endpoint",s.includes("/api/ai/provider-cost")]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
