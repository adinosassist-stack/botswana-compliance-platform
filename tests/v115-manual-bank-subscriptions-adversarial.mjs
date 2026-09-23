import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const e=fs.readFileSync(new URL("../.env.example",import.meta.url),"utf8");
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
 ["hosted subscription checkout removed",!h.includes("Preparing secure hosted checkout")&&!h.includes("Opening the configured hosted payment provider")]
];
const bad=checks.filter(x=>!x[1]);for(const [n,ok] of checks)console.log(`${ok?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
