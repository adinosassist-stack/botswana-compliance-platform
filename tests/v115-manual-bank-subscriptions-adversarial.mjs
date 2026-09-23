import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const e=fs.readFileSync(new URL("../.env.example",import.meta.url),"utf8");
const d=fs.readFileSync(new URL("../docs/SUBSCRIPTIONS.md",import.meta.url),"utf8");

const between=(start,end)=>{const a=w.indexOf(start),b=w.indexOf(end,a+start.length);return a>=0&&b>a?w.slice(a,b):""};
const customerSubmit=between('if(url.pathname==="/api/payments/manual/submit"','if(url.pathname==="/api/payments/subscription-checkout"');
const adminReview=between('if(url.pathname.match(/^\\/api\\/platform\\/billing\\/manual-payments','if(url.pathname==="/api/platform/deployment-readiness"');
const checkout=between('if(url.pathname==="/api/payments/subscription-checkout"','if(url.pathname==="/api/payments/ai-credit-checkout"');

const checks=[
 ["manual submission schema",s.includes("CREATE TABLE IF NOT EXISTS manual_payment_submissions")&&s.includes("payment_reference TEXT NOT NULL UNIQUE")],
 ["manual state machine",s.includes("'awaiting_payment','submitted','under_review','verified','rejected','canceled'")],
 ["verified bank ref unique",s.includes("manual_payment_verified_bank_reference_unique")&&s.includes("status='verified'")],
 ["manual mode env documented",e.includes("SUBSCRIPTION_PAYMENT_MODE=manual_bank")&&e.includes("MANUAL_PAYMENT_ACCOUNT_NUMBER=")],
 ["bank config fails closed",w.includes('error:"manual_payment_not_configured"')&&w.includes('missing:cfg.missing')],
 ["unique Thebe reference",w.includes("function manualPaymentReference")&&w.includes("TBD-")],
 ["manual order remains pending",w.includes("'subscription','manual_bank',?,'pending'")],
 ["customer submit exact amount",customerSubmit.includes("payment_amount_mismatch")&&customerSubmit.includes("amountPaidBwp")],
 ["customer cannot settle",!customerSubmit.includes("applyVerifiedPaymentOrder")&&!customerSubmit.includes("status='active'")],
 ["customer submit requires owner",customerSubmit.includes('roleAllowed(a,"owner")')],
 ["customer bank ref reuse blocked",customerSubmit.includes("bank_reference_already_used")],
 ["submit only enters review",customerSubmit.includes("status='submitted'")&&customerSubmit.includes("subscription remains inactive")],
 ["manual subscription mode",checkout.includes('checkoutMode:"manual_bank"')&&checkout.includes("createManualSubscriptionPaymentOrder")],
 ["automated checkout preserved",checkout.includes('checkoutMode:"provider_hosted"')&&w.includes("createConfiguredCheckout")],
 ["platform admin gate",adminReview.includes('requirePlatformRegulatory(a,env,"admin")')],
 ["reflected funds confirmation",adminReview.includes("confirmedReceived!==true")&&adminReview.includes("reflected_funds_confirmation_required")],
 ["admin exact amount gate",adminReview.includes("confirmed_amount_mismatch")&&adminReview.includes("amount_submitted_bwp")],
 ["admin one-time settlement",adminReview.includes("applyVerifiedPaymentOrder")&&w.includes("claimPaymentSettlement")],
 ["failed settlement can recover",w.includes("failed_claim_recovered")&&w.includes('existing?.status==="failed"')],
 ["admin audit",adminReview.includes("MANUAL_BANK_PAYMENT_VERIFIED")&&adminReview.includes("platformRegulatoryAudit")],
 ["manual refunds require review",w.includes("manual_bank_refund_required")&&w.includes("Manual bank payment refund requires operations review")],
 ["customer bank UI",h.includes("Bank transfer ready — your plan is not active yet.")&&h.includes('id="manualBankReference"')&&h.includes("I have paid — submit for verification")],
 ["admin UI hidden by default",h.includes('id="manualPaymentAdminCard" style="display:none"')],
 ["explicit activation confirmation",h.includes("Verify & activate")&&h.includes("visibly reflected in the Thebe Desk company bank account")],
 ["no proof screenshot activation",d.includes("proof-of-payment screenshot is deliberately not treated as settlement evidence")],
 ["documentation says admin verified",d.includes("explicitly verifies that the exact amount has reflected")]
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(!ok)failed++}
if(failed){console.error(`Manual bank subscription adversarial checks failed: ${failed}/${checks.length}`);process.exit(1)}
console.log(`Manual bank subscription adversarial checks: ${checks.length}/${checks.length} PASS`);
