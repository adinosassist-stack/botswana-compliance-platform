import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["plan entitlements",s.includes("plan_entitlements")],
 ["usage counters",s.includes("tenant_usage_counters")],
 ["overrides",s.includes("entitlement_overrides")],
 ["entitlement helper",w.includes("requireEntitlement")],
 ["limit helper",w.includes("enforceUsageLimit")],
 ["entitlements api",w.includes("/api/entitlements")],
 ["tender gated",w.includes('"tenderready","tenders_active"')],
 ["licence gated",w.includes('"licenceos","licences_active"')],
 ["partner gated",w.includes('"partner_portal"')],
 ["plan access UI",h.includes('id="entitlements"')]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
