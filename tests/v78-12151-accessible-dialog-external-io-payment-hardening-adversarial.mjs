import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {__v782151Test} from "../cloudflare/src/worker.js";

const root=process.cwd(),read=p=>fs.readFileSync(path.join(root,p),"utf8"),pkg=JSON.parse(read("package.json")),profile=JSON.parse(read("RELEASE_PROFILE.json"));
const html=read("public/index.html"),dialog=read("public/js/dialog-service.js"),dom=read("public/js/dom-security.js"),worker=read("cloudflare/src/worker.js"),lint=read("scripts/lint-production.mjs"),sw=read("public/sw.js"),routeAudit=read("scripts/route-security-audit.mjs"),envExample=read(".env.example"),wrangler=read("cloudflare/wrangler.toml"),builder=read("scripts/build-release-preview.mjs"),launchDoc=read("docs/LAUNCH.md");
let checks=0;const ok=(v,m)=>{checks++;if(!v)throw new Error(`FAIL ${checks}: ${m}`)};

ok(["1.21.51","1.21.52","1.21.53","1.21.54","1.21.55","1.21.56","1.21.57","1.21.58","1.21.59","1.21.60","1.21.61","1.21.62","1.21.63","1.21.64","1.21.65","1.21.66","1.21.67","1.21.68","1.21.69","1.21.70","1.21.71","1.21.72","1.21.73","1.21.74","1.21.75","1.21.76","1.21.77","1.21.78","1.21.79","1.21.80","1.21.81","1.21.82","1.21.83","1.21.84","1.21.85","1.21.86","1.21.87","1.21.88","1.21.89","1.21.90","1.21.91","1.21.92","1.21.93","1.21.94","1.21.95","1.21.96","1.21.97","1.21.98","1.21.99","1.21.100","1.21.101"].includes(pkg.version),"package must identify v1.21.51 or reviewed successor");
ok(profile.package_version===pkg.version&&profile.software_release_candidate===`v78.${pkg.version}`,"release profile must align to v1.21.51 or reviewed successor");
ok(worker.includes(`const APP_RELEASE="v78.${pkg.version}"`)&&routeAudit.includes(`release:"${pkg.version}"`)&&(/1\.21\.51-accessible-dialog-external-io-payment-hardening|1\.21\.52-tenant-lifecycle-purge-performance-hardening|1\.21\.53-payment-webhook-scheduled-restore-hardening|1\.21\.54-idempotency-cross-layer-recovery-hardening|1\.21\.55-replay-resource-hardening|1\.21\.56-concurrency-transition-hardening|1\.21\.57-authorization-reporting-concurrency-hardening|1\.21\.58-webhook-purge-claim-hardening|59-password-reset-single-consumption-hardening|60-password-reset-resource-hardening|61-password-reset-issuance-hardening|62-password-reset-email-delivery-hardening|63-public-origin-fail-closed-hardening|64-oauth-redirect-hardening|65-oauth-identity-ownership-hardening|66-auth-method-unlink-concurrency-hardening|67-session-generation-revocation-hardening|68-session-inventory-hardening|69-per-session-revocation-hardening|70-password-login-reset-race-hardening|71-node-password-reset-parity-hardening|72-node-public-app-url-hardening|73-node-proxy-trust-hardening|74-malware-scan-replay-hardening|75-durable-auth-rate-limit-hardening|76-oauth-brute-force-hardening|77-public-edge-abuse-hardening|78-prebody-abuse-hardening|79-request-encoding(?:-abuse)?-hardening|80-cloudflare-account-throttle-hardening|81-password-reset-account-throttle-hardening|82-node-production-mode-integrity-hardening|83-http-expectation-envelope-hardening|84-brute-force-remediation-hardening|85-release-boundary-hardening|86-payment-auth-configuration-hardening|87-registration-timing-enumeration-hardening|88-oauth-redirect-configuration-hardening|89-social-link-csrf-hardening|90-outbound-scanner-endpoint-hardening|91-password-reset-fragment-hardening|92-node-oauth-callback-continuity-hardening|93-external-response-bounding-hardening|94-oauth-state-cookie-hardening|95-fetch-metadata-csrf-hardening|96-node-evidence-scan-fail-closed|97-node-evidence-upload-toctou-hardening|98-node-evidence-signature-hardening|99-bf07-seal-pipeline-hardening|100-bf07-provenance-hardening|101-bf07-toolchain-package-hardening|101-registration-owner-ui-hotfix-20260914/.test(sw)),"Worker, service worker and route inventory must align to v1.21.51 or reviewed successor");
ok(profile.v12151_accessible_dialog_external_io_payment_hardening===true,"release profile must record v1.21.51 hardening");
const launchIdentity="For **V78 "+pkg.version+"**, the package/cache version is `"+pkg.version+"`";
ok(launchDoc.includes(launchIdentity)&&launchDoc.includes(profile.latest_cloudflare_migration),"launch documentation must align package/cache identity and current migration");

const publicFiles=["public/index.html",...fs.readdirSync(path.join(root,"public/js")).filter(x=>x.endsWith(".js")).map(x=>`public/js/${x}`)];
for(const file of publicFiles){const s=read(file);ok(!/(^|[^.\w$])confirm\s*\(/m.test(s),`${file} must not use native confirm()`);ok(!/(^|[^.\w$])prompt\s*\(/m.test(s),`${file} must not use native prompt()`)}
ok(html.includes('src="js/dialog-service.js"'),"production app must load the accessible dialog service");
ok(builder.includes('"notifications.js","dialog-service.js","api-client.js"'),"standalone preview builder must inline the accessible dialog service in production script order");
ok(dialog.includes('role","dialog"')&&dialog.includes('aria-modal","true"')&&dialog.includes("textContent")&&dialog.includes("stopImmediatePropagation")&&dialog.includes("exactValue"),"dialog service must be accessible, safe-text based, validated and isolate keyboard cancellation");
ok(lint.includes("must not use native confirm()")&&lint.includes("must not use native prompt()")&&lint.includes("public/js/dialog-service.js"),"production lint must permanently ban native browser dialogs and require the dialog service");
ok(html.includes("BW.dialog.confirm")&&html.includes("BW.dialog.prompt"),"sensitive workflows must use the accessible dialog service");
ok(profile.native_browser_confirm_prompt_calls===0&&profile.accessible_async_dialog_service===true,"release profile must record zero native browser dialogs");

ok(worker.includes("async function externalFetch(url,options={},timeoutMs=20000)")&&worker.includes('redirect:"error"')&&worker.includes('controller.abort("external_timeout")'),"outbound provider calls must use bounded timeout and reject redirects");
const outboundCalls=(worker.match(/await externalFetch\(/g)||[]).length;ok(outboundCalls>=10,"all material outbound integrations must use the centralized external fetch guard");
ok((worker.match(/await fetch\(/g)||[]).length===1&&worker.includes('try{return await fetch(url,{...options,signal:controller.signal,redirect:"error"})'),"Worker business logic must not bypass externalFetch for bare outbound fetch calls");
ok(profile.outbound_external_fetch_timeout_ms===20000&&profile.outbound_external_fetch_redirect_policy==="error","release profile must record outbound I/O policy");

ok(worker.includes('const DPO_DEFAULT_HOSTS=new Set(["secure.3gdirectpay.com"])')&&worker.includes("function trustedDpoUrl"),"DPO endpoints must use an explicit HTTPS host allowlist");
ok(worker.includes("trustedDpoUrl(env,env.DPO_VERIFY_API_URL||env.DPO_API_URL")&&worker.includes("trustedDpoUrl(env,env.DPO_REFUND_API_URL||env.DPO_API_URL")&&worker.includes("trustedDpoUrl(env,env.DPO_API_URL")&&worker.includes("trustedDpoUrl(env,env.DPO_CHECKOUT_URL"),"DPO create/verify/refund/checkout endpoints must all be allowlisted");
ok(worker.includes('{key:"DPO_ENDPOINTS",required:provider==="dpo"'),"production readiness must fail closed on untrusted DPO endpoint configuration");
ok(envExample.includes("DPO_ALLOWED_HOSTS=secure.3gdirectpay.com")&&wrangler.includes("DPO_ALLOWED_HOSTS"),"DPO host allowlist must be documented in deployment configuration");
ok(dom.includes("function safeHostedCheckoutUrl")&&html.includes("BW.dom.safeHostedCheckoutUrl(r.checkoutUrl,r.provider)"),"browser checkout redirect must have independent HTTPS/provider-host validation");
ok(profile.dpo_https_host_allowlist===true&&profile.browser_dpo_checkout_host_validation===true,"release profile must record payment redirect hardening");

ok(__v782151Test.trustedDpoUrl({},"https://secure.3gdirectpay.com/API/v6/")?.startsWith("https://secure.3gdirectpay.com/"),"default DPO host must be accepted");
ok(__v782151Test.trustedDpoUrl({},"https://evil.example/API/v6/")===null,"untrusted DPO host must be rejected");
ok(__v782151Test.trustedDpoUrl({DPO_ALLOWED_HOSTS:"payments.example.com"},"https://payments.example.com/pay")?.startsWith("https://payments.example.com/"),"explicit exact DPO host additions must be supported");
ok(__v782151Test.trustedDpoUrl({DPO_ALLOWED_HOSTS:"payments.example.com"},"http://payments.example.com/pay")===null,"DPO host additions must still require HTTPS");
ok(__v782151Test.validPublicAppUrl("https://app.example/path")?.startsWith("https://app.example/"),"valid HTTPS public app URL must be accepted");
ok(__v782151Test.validPublicAppUrl("http://app.example/")===null&&__v782151Test.validPublicAppUrl("https://user:pass@app.example/")===null,"public app URL validation must reject insecure or credential-bearing URLs");

const originalFetch=globalThis.fetch;let captured=null;
try{
  globalThis.fetch=async(url,options)=>{captured={url:String(url),options};return new Response("ok",{status:200})};
  const r=await __v782151Test.externalFetch("https://provider.example/test",{method:"POST",body:"x"},1000);
  ok(r.ok&&captured?.options?.redirect==="error"&&captured?.options?.signal instanceof AbortSignal,"externalFetch runtime must inject redirect refusal and an abort signal");
}finally{globalThis.fetch=originalFetch}

ok(worker.includes("LIMIT 1000\").bind(a.tenant_id).all()")&&worker.includes("LIMIT 3000\").bind(a.tenant_id).all()")&&worker.includes("obligation_escalations WHERE tenant_id=? ORDER BY created_at DESC LIMIT 1000"),"inspection-pack snapshot collections must be bounded");
ok(worker.includes('boundedReportText(b.label||`${sim.scenario.name} Pack`,120)'),"inspection-pack label must be bounded");
ok(worker.includes('if(Number(released.meta?.changes||0)!==1)return json({error:"active_legal_hold_not_found"},404)'),"legal-hold release must not claim success for a missing/already-released hold");
ok(worker.includes('const base=(validPublicAppUrl(env.PUBLIC_APP_URL)||`${url.origin}/`)')&&worker.includes('const origin=(validPublicAppUrl(env.PUBLIC_APP_URL)||`${url.origin}/`)'),"payment-return and public share links must validate configured PUBLIC_APP_URL at runtime");

console.log(`V78 1.21.51 accessible-dialog/external-I-O/payment hardening gate: ${checks}/${checks} PASS`);
