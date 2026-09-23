import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const e=fs.readFileSync(new URL("../.env.example",import.meta.url),"utf8");
const m=fs.readFileSync(new URL("../cloudflare/migrations/050_v115_manual_bank_subscriptions.sql",import.meta.url),"utf8");
const mr=fs.readFileSync(new URL("../scripts/migrate-production-v115-manual-bank-subscriptions.mjs",import.meta.url),"utf8");
const mw=fs.readFileSync(new URL("../.github/workflows/migrate-production-v115-manual-bank-subscriptions.yml",import.meta.url),"utf8");
const profile=JSON.parse(fs.readFileSync(new URL("../RELEASE_PROFILE.json",import.meta.url),"utf8"));
const checks=[
 ["manual schema",s.includes("manual_payment_submissions")&&s.includes("manual_payment_events")&&s.includes("bank_reference TEXT NOT NULL UNIQUE")],
 ["bank config env",e.includes("THEBE_BANK_NAME=")&&e.includes("THEBE_BANK_ACCOUNT_NUMBER=")&&e.includes("THEBE_BANK_BRANCH_NAME=")&&e.includes("THEBE_BANK_SWIFT_CODE=")],
 ["manual checkout",w.includes('checkoutMode:"manual_bank_transfer"')&&w.includes("manualPaymentReference")&&w.includes("manual_bank_transfer_not_configured")],
 ["no proof auto activation",w.includes("/api/payments/manual-bank/submit")&&w.includes("Payment submitted for manual verification")&&!w.includes('submitManualBankPayment') ],
 ["platform admin approval",w.includes("/api/platform/billing/manual-payments")&&w.includes("platformBillingAdmin")&&w.includes("MANUAL_APPROVED")],
 ["one time fulfillment preserved",w.includes("applyVerifiedPaymentOrder(env,row.payment_order_id")&&w.includes("claimPaymentSettlement")],
 ["duplicate bank ref blocked",w.includes("bank_reference_already_used")&&s.includes("bank_reference TEXT NOT NULL UNIQUE")],
 ["pending order reused",w.includes("reused:true")&&w.includes("existing pending bank-transfer reference")],
 ["customer UI bank details",h.includes("Manual bank transfer")&&h.includes("I have paid")&&h.includes("manualBankReference")&&!h.includes("<b>Account name:</b>")&&h.includes("<b>Branch:</b>")&&h.includes("<b>SWIFT:</b>")],
 ["approval warning",h.includes("Approve only after the matching funds are visible")&&h.includes("Verify & activate")],
 ["hosted subscription checkout removed",!h.includes("Preparing secure hosted checkout")&&!h.includes("Opening the configured hosted payment provider")],
 ["release tip 050",profile.latest_cloudflare_migration==="050_v115_manual_bank_subscriptions.sql"&&m.includes("manual_payment_submissions")],
 ["guarded production migration runner",mr.includes("expectedGitBlobSha='9fc8a50b365e20eb313166912b7b42a266f1322b'")&&mr.includes("time_travel/bookmark")&&mr.includes("PRAGMA foreign_key_check")&&mr.includes("reviewed idempotent forward-only migration 050")],
 ["migration workflow isolated",mw.includes("environment: production")&&mw.includes("[migrate-050]")&&mw.includes("migrate-production-v115-manual-bank-subscriptions.mjs")&&!mw.includes("wrangler deploy")]
];
const bad=checks.filter(x=>!x[1]);for(const [n,ok] of checks)console.log(`${ok?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
