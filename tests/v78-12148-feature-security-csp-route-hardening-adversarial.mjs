import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const pkg=JSON.parse(read("package.json"));
const profile=JSON.parse(read("RELEASE_PROFILE.json"));
const html=read("public/index.html");
const events=read("public/js/event-delegation.js");
const api=read("public/js/api-client.js");
const dom=read("public/js/dom-security.js");
const worker=read("cloudflare/src/worker.js");
const server=read("server/server.js");
const builder=read("scripts/build-release-preview.mjs");
const routeAudit=read("scripts/route-security-audit.mjs");
const policy=JSON.parse(read("cloudflare/config/route-security-policy.json"));
const sw=read("public/sw.js");
let checks=0;
const ok=(cond,msg)=>{checks++;if(!cond)throw new Error(`FAIL ${checks}: ${msg}`)};

ok(/^1\.21\.(?:4[89]|[5-9]\d|\d{3,})$/.test(pkg.version),"package release must retain or supersede 1.21.48");
ok(profile.package_version===pkg.version,"profile package version aligned");
ok(profile.software_release_candidate===`v78.${pkg.version}`,"profile release candidate aligned");
ok(worker.includes(`const APP_RELEASE="v78.${pkg.version}"`),"Cloudflare Worker release aligned");
ok(server.includes(`const APP_VERSION="${pkg.version}"`),"Node fallback release aligned");
ok(sw.includes(`bw-business-protection-v78-${pkg.version}-`),"service worker release cache aligned");

ok(!/<script\s+src=["']js\/preview-(?:data|api)\.js["']/i.test(html),"preview modules are not loaded by production HTML");
ok(builder.includes('previewOnlyScripts=["preview-data.js","preview-api.js"]'),"preview builder owns preview-only module list");
ok(builder.includes('data-preview-only="${file}"'),"preview builder injects preview-only transport");
ok(builder.includes('content="preview"'),"preview builder explicitly flips runtime mode");
ok(builder.includes('if(/<script\\s+src="js\\//.test(standalone))'),"standalone builder rejects residual external app JS");

ok(!/\son(?:click|change|input|keydown|keyup|focus|submit)\s*=/i.test(html),"production HTML has no native inline event attributes");
ok(html.includes('src="js/event-delegation.js"'),"delegated event runtime is loaded");
ok(events.includes("const ALLOWED_ACTIONS=new Set(["),"delegated actions use explicit allowlist");
ok(events.includes("MAX_EXPRESSION_LENGTH=600"),"delegated expression length is bounded");
ok(events.includes("statements.length<=4"),"delegated expression statement count is bounded");
ok(!/\beval\s*\(|new\s+Function\s*\(/.test(events),"delegated runtime does not use eval/Function");

// Execute the validator in a minimal browser-like VM and verify every source-authored delegated action.
class FakeElement{}
const listeners=[];
const window={Element:FakeElement,document:{addEventListener:(...args)=>listeners.push(args)},location:{href:"https://app.example/",origin:"https://app.example"},setTimeout,console,navigator:{}};
window.window=window;
vm.runInNewContext(events,{window,console,setTimeout,URL},{filename:"event-delegation.js"});
const validator=window.BW?.events?.isAllowedExpression;
ok(typeof validator==="function","delegated event validator is exposed for audit");
const delegatedCount=(html.match(/data-bw-on(?:click|change|input|keydown|keyup|focus|submit)=/gi)||[]).length;
ok(delegatedCount>=400,"delegated action migration covers the full UI surface");
ok(dom.includes("global.BW?.events?.isAllowedExpression?.(value)"),"sanitized dynamic markup validates delegated expressions after interpolation");
ok(dom.includes('name.startsWith("data-bw-on")'),"DOM sanitizer explicitly governs delegated event attributes");
const shellOnly=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
const staticAttr=/data-bw-on(?:click|change|input|keydown|keyup|focus|submit)=(?:"([^"]*)"|'([^']*)')/gi;
const staticExpressions=[...shellOnly.matchAll(staticAttr)].map(m=>m[1]??m[2]);
ok(staticExpressions.length>0&&staticExpressions.every(x=>validator(x)),"static DOM delegated expressions are allowlisted and parseable");

ok(worker.includes("script-src-attr 'none'"),"Cloudflare CSP disables inline event execution");
ok(server.includes("script-src-attr 'none'"),"Node HTML CSP disables inline event execution");
ok(!server.includes("script-src-attr 'unsafe-inline'"),"Node HTML CSP does not re-enable unsafe inline event attributes");
ok(server.includes('u.protocol==="https:"?u.origin:""'),"Node object-storage CSP source only accepts HTTPS origins");
ok(server.includes("connect-src ${connect}"),"Node HTML CSP retains configured secure object-storage upload origin");

ok(api.includes("target.origin!==global.location.origin"),"application API rejects cross-origin destinations");
ok(api.includes('code:"cross_origin_api_blocked"'),"cross-origin API rejection has explicit error code");
ok(api.includes('credentials:"same-origin"'),"application API uses same-origin credentials");
ok(api.includes('redirect:"error"'),"API transport rejects redirects");
ok(api.includes('credentials:"omit"'),"presigned upload omits application credentials");
ok(api.includes('referrerPolicy:"no-referrer"'),"presigned upload suppresses referrer leakage");
ok(api.includes('target.protocol!=="https:"&&!localHttp'),"presigned upload blocks insecure non-local destinations");

ok(policy.preAuthRoutes.flatMap(r=>r.methods).length===24,"pre-auth method/route allowlist count is locked");
ok(Object.keys(policy.workspaceFeaturePrefixes).length===25,"authenticated feature-family inventory count is locked");
ok(routeAudit.includes('Unclassified pre-auth route(s)'),"route audit fails on unexpected pre-auth routes");
ok(routeAudit.includes('Authenticated route(s) missing feature inventory classification'),"route audit fails on unclassified authenticated routes");
ok(routeAudit.includes('authenticatedRouteCount:workspaceRoutes.length'),"route audit emits authenticated route count");
ok(routeAudit.includes(`release:"${pkg.version}"`),"route inventory release identity aligned");

const expectedAuthenticatedRoutes=pkg.version==="1.21.101"?254:["1.21.89","1.21.90","1.21.91","1.21.92","1.21.93","1.21.94","1.21.95","1.21.96","1.21.97","1.21.98","1.21.99","1.21.100"].includes(pkg.version)?253:["1.21.53","1.21.54","1.21.55","1.21.56","1.21.57","1.21.58","1.21.59","1.21.60","1.21.61","1.21.62","1.21.63","1.21.64","1.21.65","1.21.66","1.21.67","1.21.68","1.21.69","1.21.70","1.21.71","1.21.72","1.21.73","1.21.74","1.21.75","1.21.76","1.21.77","1.21.78","1.21.79","1.21.80","1.21.81","1.21.82","1.21.83","1.21.84","1.21.85","1.21.86","1.21.87","1.21.88"].includes(pkg.version)?252:251;
for(const [key,value] of Object.entries({
 route_security_inventory:true,
 route_security_feature_families:25,
 authenticated_route_branches:expectedAuthenticatedRoutes,
 preauth_route_allowlist:23,
 csp_inline_event_execution_disabled:true,
 delegated_ui_actions_allowlisted:true,
 preview_modules_not_loaded_in_production:true,
 cross_origin_api_requests_blocked:true,
 presigned_upload_no_credentials_referrer_redirect:true,
 production_route_inventory_fail_closed:true,
 v12148_feature_security_csp_route_hardening:true
})) ok(profile[key]===value,`release profile ${key}`);

console.log(`V78 1.21.48 feature security/CSP/route hardening gate: ${checks}/${checks} PASS; delegated source attributes ${delegatedCount}`);
