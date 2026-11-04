import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["verification attempts",s.includes("payment_verification_attempts")&&s.includes("verification_status")],
 ["fulfillments",s.includes("payment_fulfillments")&&s.includes("legacy_assumed_applied")],
 ["settlement claims",s.includes("payment_settlement_claims")&&s.includes("claim_token")],
 ["refund requests",s.includes("payment_refund_requests")&&s.includes("payment_refund_active_unique")],
 ["legacy paid protected",s.includes("Prevent old paid orders from being fulfilled a second time")&&s.includes("legacy-v65")],
 ["DPO verify request",w.includes("<Request>verifyToken</Request>")&&w.includes("DPO_VERIFY_API_URL")],
 ["pre-fulfillment verify zero",w.includes("<VerifyTransaction>0</VerifyTransaction>")],
 ["post-fulfillment acknowledge one",w.includes("<VerifyTransaction>1</VerifyTransaction>")&&w.includes("acknowledgeDpoFulfillment")],
 ["ack retry sweep",w.includes("retryDpoAcknowledgements(env,25)")],
 ["DPO mismatch codes",w.includes('DPO_MISMATCH_CODES=new Set(["002","902"])')],
 ["provider token not separately returned",!w.includes("checkoutUrl:checkout,providerToken:token")],
 ["paid code only",w.includes('const DPO_PAID_CODE="000"')&&w.includes('result===DPO_PAID_CODE')],
 ["pending not paid",w.includes("DPO_PENDING_CODES")&&w.includes('status="pending"')],
 ["fraud blocked",w.includes("DPO_ALLOWED_FRAUD_CODES")&&w.includes("DPO_FRAUD_REVIEW_CODES")&&w.includes('status="fraud_review"')],
 ["provider token unique",s.includes("payment_provider_session_token_unique")],
 ["legacy duplicate quarantine",s.includes("payment_integrity_anomalies")&&s.includes("manual_review_duplicate_token")&&s.includes("quarantined_reference_removed")],
 ["provider payment unique",s.includes("payment_order_provider_payment_unique")],
 ["refund race blocked",s.includes("payment_refund_active_unique")&&w.includes("refund_already_processing_or_completed")],
 ["BWP exact gate",w.includes('currency!=="BWP"')&&w.includes("provider_amount_currency_mismatch")],
 ["response hashed",w.includes("responseHash=responseText?await sha256Hex(responseText):null")],
 ["token not logged raw",w.includes("tokenHash:await sha256Hex(token)")&&!w.includes("providerToken:token")],
 ["webhook secret timing safe",w.includes("timingSafeText(supplied,env.PAYMENT_WEBHOOK_SECRET)")],
 ["browser return server verify",w.includes('triggerType="browser_return"')||w.includes('"browser_return"')],
 ["return URL points server",w.includes("/api/payments/return?provider=dpo&result=success")],
 ["unexpired trusted checkout reused",w.includes("const existingCheckout=existing?.checkout_url?trustedDpoUrl(env,existing.checkout_url):null;") && w.includes("checkoutUrl:existingCheckout,reused:true")],
 ["webhook cannot directly settle",w.includes('eventType==="payment.succeeded"&&orderId)result=await verifyAndSettlePaymentOrder')],
 ["legacy settle 410",w.includes("direct_settlement_disabled_use_verify_and_settle")&&w.includes("legacy_ai_credit_settlement_disabled_use_payment_orders")],
 ["one-time claim",w.includes("claimPaymentSettlement")&&w.includes("stale_claim_recovered")],
 ["claim failure recorded",w.includes("finishPaymentSettlementClaim")&&w.includes('"failed",e')],
 ["scheduled reconciliation bounded",w.includes("reconcilePendingPayments(env,25)")&&w.includes("LIMIT ?")],
 ["DPO refund official flow",w.includes("<Request>refundToken</Request>")&&w.includes("<refundAmount>")],
 ["refund dual secret",w.includes('x-billing-secret')&&w.includes('x-operations-secret')],
 ["used AI credits block refund",w.includes("credits_already_consumed")],
 ["refund holds AI spending",w.includes("ai_credit_refund_in_progress")&&w.includes("payment_refund_requests rr")],
 ["atomic AI spend",w.includes("RETURNING balance")&&w.includes("balance=balance-?")],
 ["refund locked recheck",w.includes("const lockedPreflight=await refundPreflight(env,order)")&&w.includes("preflight_changed")],
 ["service delivery blocks refund",w.includes("service_already_in_delivery")],
 ["newer subscription preserved",w.includes("newer_subscription_preserved")],
 ["tenant verification API",w.includes("/api/payments/verifications")&&w.includes("WHERE v.tenant_id=? AND o.tenant_id=?")],
 ["refund read role gate",w.includes("/api/payments/refunds")&&w.includes('roleAllowed(a,"owner","manager","reviewer")')],
 ["verification UI",h.includes('id="paymentVerificationList"')&&h.includes("Only verified-paid can fulfill an order.")],
 ["refund UI",h.includes('id="paymentRefundList"')&&h.includes("Refund control")],
 ["manual bank owner authorization",w.includes('manualAdminMatch&&req.method==="POST"')&&w.includes('platform_billing_forbidden')],
 ["bank credit attestation required",w.includes('action==="approve"&&body.bankFundsConfirmed!==true')&&w.includes('bank_funds_confirmation_required')],
 ["bank amount match required",w.includes('action==="approve"&&body.bankAmountMatched!==true')&&w.includes('bank_amount_match_required')],
 ["bank transaction match required",w.includes('action==="approve"&&body.bankTransactionMatched!==true')&&w.includes('bank_transaction_match_required')],
 ["manual bank submission state guard",w.includes('manual_payment_already_reviewed')&&w.includes('manual_payment_review_in_progress')],
 ["manual bank no double settlement",w.includes('recoveredExistingFulfillment:true')&&w.includes('paid_order_reconciliation_required')],
 ["manual bank durable activation verification",w.includes('manual_payment_activation_failed')&&w.includes('f.fulfillment_status=\'applied\'')&&w.includes('s.status=\'active\'')],
 ["runtime current",/version:"v(?:65|6[6-9]|[7-9][0-9])",runtime:"cloudflare-worker"/.test(w)]
];
// The manual-bank approval safety checks must precede *every* approval
// attempt's first submission read or settlement operation. Presence-only
// assertions above cannot detect a guard accidentally moved after a write.
const manualApprove=w.split('const manualAdminMatch=url.pathname.match(')[1]?.split('const row=await env.DB.prepare(')[0];
if(!manualApprove)throw Error('manual_bank_approval_route_missing');
for(const required of [
  'platformBillingAdmin(a,env)',
  '!body||typeof body!=="object"||Array.isArray(body)',
  'body.bankFundsConfirmed!==true',
  'body.bankAmountMatched!==true',
  'body.bankTransactionMatched!==true'
])if(!manualApprove.includes(required))throw Error('manual_bank_approval_guard_must_precede_database_access: '+required);
const positions=['platformBillingAdmin(a,env)','!body||typeof body!=="object"||Array.isArray(body)','body.bankFundsConfirmed!==true','body.bankAmountMatched!==true','body.bankTransactionMatched!==true'].map(x=>manualApprove.indexOf(x));
if(positions.some((pos,i)=>i>0&&pos<=positions[i-1]))throw Error('manual_bank_approval_guard_order_invalid');

const bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);

const settlementUpsert=w.match(/INSERT INTO subscriptions\(([^)]+)\) VALUES\(\?,\?,'active',[\s\S]*?ON CONFLICT\(tenant_id\) DO UPDATE SET ([^\x60]+)/);
const canonicalSubscription=s.match(/CREATE TABLE IF NOT EXISTS subscriptions\s*\(([\s\S]*?)\n\);/i);
if(!settlementUpsert||!canonicalSubscription)throw new Error("subscription settlement SQL or canonical schema missing");
const subscriptionColumns=new Set([...canonicalSubscription[1].matchAll(/^\s*([a-z_]+)\s+(?:TEXT|INTEGER|REAL|BLOB)\b/gim)].map(m=>m[1]));
const settlementColumns=[...settlementUpsert[1].split(",").map(x=>x.trim()),...[...settlementUpsert[2].matchAll(/(?:^|,)\s*([a-z_]+)\s*=/g)].map(m=>m[1])];
for(const column of settlementColumns)if(!subscriptionColumns.has(column))throw new Error("settlement references unknown subscriptions column: "+column);
