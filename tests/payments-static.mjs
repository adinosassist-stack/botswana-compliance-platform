import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["payment orders schema",s.includes("payment_orders")],
 ["payment events schema",s.includes("payment_events")],
 ["payment failures schema",s.includes("payment_failures")],
 ["subscription checkout",w.includes("/api/payments/subscription-checkout")],
 ["ai checkout",w.includes("/api/payments/ai-credit-checkout")],
 ["service checkout",w.includes("/api/payments/service-checkout")],
 ["verified webhook",w.includes("/api/webhooks/payment")&&w.includes("PAYMENT_WEBHOOK_SECRET")],
 ["idempotent events",s.includes("UNIQUE(provider,provider_event_id)")],
 ["direct settlement disabled",w.includes("direct_settlement_disabled_use_provider_verification")],
 ["DPO verify token",w.includes("<Request>verifyToken</Request>")&&w.includes("TransactionToken")],
 ["verified paid only",w.includes('result===DPO_PAID_CODE')&&w.includes('status="verified_paid"')],
 ["amount currency match",w.includes('currency!=="BWP"')&&w.includes("moneyEquals(amount,order.amount_bwp)")],
 ["fraud review gate",w.includes("DPO_FRAUD_REVIEW_CODES")&&w.includes("provider_fraud_review_required")],
 ["settlement claims",s.includes("payment_settlement_claims")&&w.includes("claimPaymentSettlement")],
 ["legacy AI settle disabled",w.includes("legacy_ai_credit_settlement_disabled_use_payment_orders")],
 ["browser return verifies",w.includes('verifyAndSettlePaymentOrder(env,order.id,"browser_return")')],
 ["scheduled reconcile",w.includes("reconcilePendingPayments(env,25)")],
 ["refund provider call",w.includes("<Request>refundToken</Request>")&&w.includes("refundPreflight")],
 ["payments UI",h.includes('id="payments"')],
 ["ai checkout response",h.includes("r.pack.credits")&&h.includes("/api/payments/ai-credit-checkout")],
 ["service payment wiring",h.includes("/api/payments/service-checkout")],
 ["subscription payment wiring",h.includes("/api/payments/subscription-checkout")]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
