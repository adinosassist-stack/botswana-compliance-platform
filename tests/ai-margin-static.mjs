import fs from "node:fs";
const s=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const schema=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const allocationClaim=s.indexOf("used_this_month+?<=monthly_cap");
const poolClaim=s.indexOf("balance>=?\n      RETURNING balance");
const partnerLedger=s.indexOf('funding:"partner_pool"');
const allocationRollback=(s.match(/used_this_month=MAX\(0,used_this_month-\?\)/g)||[]).length;
const checks=[
 ["cost controls",schema.includes("ai_cost_controls")],
 ["provider costs",schema.includes("ai_provider_costs")],
 ["spend guard",s.includes("checkAiSpendGuard")],
 ["partner fallback",s.includes("consumePartnerPoolIfAvailable")],
 ["partner allocation cap claimed atomically",allocationClaim>=0&&s.includes("RETURNING used_this_month,monthly_cap")],
 ["partner pool balance claimed atomically",poolClaim>=0],
 ["partner claims precede funded ledger entry",allocationClaim>=0&&poolClaim>allocationClaim&&partnerLedger>poolClaim],
 ["failed partner claims are compensated",allocationRollback>=2&&s.includes("balance=balance+?,updated_at=CURRENT_TIMESTAMP WHERE partner_tenant_id=?")],
 ["AI wallet first-use initialization is idempotent",s.includes("INSERT OR IGNORE INTO ai_credit_wallets(tenant_id,balance,monthly_allowance) VALUES(?,0,0)")],
 ["AI wallet is re-read after first-use insert",s.includes('if(!r)throw new Error("ai_wallet_unavailable")')],
 ["cost control endpoint",s.includes("/api/ai/cost-control")],
 ["provider cost endpoint",s.includes("/api/ai/provider-cost")]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);