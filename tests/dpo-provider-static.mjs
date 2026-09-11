import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["provider sessions",s.includes("payment_provider_sessions")],
 ["dpo adapter",w.includes("createDpoCheckout")],
 ["config gate",w.includes("payment_provider_not_configured")],
 ["BWP checkout",w.includes("<PaymentCurrency>BWP</PaymentCurrency>")],
 ["hosted checkout",w.includes("DPO_CHECKOUT_URL")&&w.includes("payv2.php")],
 ["checkout endpoint",w.includes("/api/payments/create-checkout")],
 ["provider status",w.includes("/api/payments/provider-status")],
 ["internal settlement",w.includes("/api/internal/payments/settle-verified")],
 ["UI redirect",h.includes("openHostedCheckout")]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
