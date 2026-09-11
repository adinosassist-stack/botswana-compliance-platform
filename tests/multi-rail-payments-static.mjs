import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["provider accounts",s.includes("payment_provider_accounts")],
 ["reconciliation",s.includes("payment_reconciliation")],
 ["return events",s.includes("payment_return_events")],
 ["provider catalog",w.includes("PAYMENT_PROVIDER_CATALOG")],
 ["orange gated",w.includes("orange_money_merchant_access_required")],
 ["no fake orange endpoint",w.includes("orange_money_production_api_not_configured")],
 ["return not settle",w.includes("Browser return recorded. Payment not settled")],
 ["provider endpoint",w.includes("/api/payments/providers")],
 ["reconciliation endpoint",w.includes("/api/payments/reconciliation")],
 ["provider UI",h.includes("Payment providers")],
 ["reconciliation UI",h.includes("Browser return is not proof of payment")]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
