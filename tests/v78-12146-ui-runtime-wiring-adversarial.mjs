import fs from "node:fs";

const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const sw=fs.readFileSync(new URL("../public/sw.js",import.meta.url),"utf8");
const profile=JSON.parse(fs.readFileSync(new URL("../RELEASE_PROFILE.json",import.meta.url),"utf8"));
const checks=[];
const check=(name,ok)=>checks.push([name,!!ok]);

for(const id of ["publicPassportGate","publicPassportResult","reporterDraftStatus","billingPlanName","billingDate","upgradeResult","deletionStatusBox","homeActionDueHint"]){
  check(`DOM surface ${id}`,html.includes(`id="${id}"`));
}
check("legacy removed Next Action renderer is gone",!html.includes("function renderNextAction(){")&&!html.includes("function openNextAction(){"));
check("passport fragment has missing-surface fail-safe",html.includes('if(!gate||!box){console.error("Public passport verification surface is unavailable.");showMarketing();return true}'));
check("passport viewer posts token without URL query",html.includes('publicApiClient.request("/public/passport/verify",{method:"POST"'));
check("billing renderer targets billingPlanName",html.includes('planEl=document.getElementById("billingPlanName")'));
check("billing renderer no stale billingPlan target",!html.includes('document.getElementById("billingPlan")'));
check("subscription checkout validates manual bank order",html.includes('if(!data?.paymentOrder?.id||data.checkoutMode!=="manual_bank_transfer")throw new Error("Manual payment order was not created.")'));
check("subscription checkout does not redirect to hosted provider",!html.includes('await openHostedCheckout(data.paymentOrder.id)'));
check("manual bank submission is wired",html.includes('/api/payments/manual-bank/submit')&&html.includes('submitManualBankPayment'));
check("standalone preview does not attempt live checkout",html.includes('if(STANDALONE_PREVIEW){billingInfo={...(billingInfo||{}),plan,status:"preview"}'));
check("deletion request refreshes visible status",html.includes('await renderDeletionStatus();'));
const historicalRevisionedCache=sw.includes(`bw-business-protection-v78-${profile.package_version}`);
const retiredWorker=sw.includes(`RETIREMENT_RELEASE="${profile.package_version}"`)&&sw.includes('self.registration.unregister()')&&!sw.includes('addEventListener("fetch"')&&!sw.includes('clients.openWindow');
check("service worker remains revisioned historically or is safely retired on successor",historicalRevisionedCache||retiredWorker);
for(const key of ["ui_runtime_wiring_hotfix","public_passport_viewer_dom_fixed","billing_status_dom_wiring_fixed","account_deletion_status_surface_fixed","daily_reporter_network_status_surface_fixed","manual_bank_subscription_payments","customer_payment_submission_is_not_activation"]){
  check(`profile ${key}`,profile[key]===true);
}

const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?"PASS":"FAIL"} ${name}`);
if(failed.length){console.error(`V78 1.21.46 UI runtime hotfix: ${failed.length}/${checks.length} failed`);process.exit(1)}
console.log(`V78 1.21.46 UI runtime hotfix: ${checks.length}/${checks.length} PASS`);
