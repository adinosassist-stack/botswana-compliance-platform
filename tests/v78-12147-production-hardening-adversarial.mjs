import fs from "node:fs";import path from "node:path";
const root=process.cwd(),read=p=>fs.readFileSync(path.join(root,p),"utf8");
const html=read("public/index.html"),worker=read("cloudflare/src/worker.js"),sw=read("public/sw.js"),pkg=JSON.parse(read("package.json"));
const stripScripts=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
const loadedScripts=[...html.matchAll(/<script\b[^>]*\bsrc=["']js\/([^"']+)["'][^>]*><\/script>/gi)].map(m=>`public/js/${m[1]}`);
const applicationSource=[html,...loadedScripts.map(read)].join("\n");
let checks=0;function ok(v,m){checks++;if(!v)throw new Error(`FAIL ${checks}: ${m}`)}
// XSS / safe DOM
ok(!/\.innerHTML\s*=/.test(applicationSource),"native innerHTML assignments must be eliminated from production application code");
ok(applicationSource.includes(".safeHTML="),"legacy dynamic markup must route through the controlled renderer");
ok(read("public/js/dom-security.js").includes('new Set(["SCRIPT","IFRAME","OBJECT","EMBED"'),"sanitizer must block executable/embed tags");
ok(read("public/js/dom-security.js").includes("replaceChildren(markupFragment"),"sanitizer must batch into a fragment and replace once");
// State / modularity
ok(applicationSource.includes("workspaceStateStore=BW.state.createStore"),"workspace state must use the centralized store");
ok(!/\b(?:state|store)\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*=/.test(applicationSource),"legacy direct state/store property assignment must be absent");
ok(applicationSource.includes("BW.components")&&applicationSource.includes("renderList(document.getElementById(\"employeeFiles\")"),"reusable component renderer must be used in production UI");
for(const f of ["dom-security.js","notifications.js","api-client.js","state-store.js","components.js"])ok(fs.existsSync(path.join(root,"public/js",f)),`production module ${f} must exist`);
for(const f of ["preview-data.js","preview-api.js"])ok(fs.existsSync(path.join(root,"preview",f)),`preview-only module ${f} must exist outside public assets`);
// Errors / API / preview separation
ok(!/\balert\s*\(/.test(applicationSource),"alert() must be removed from application flow");
ok(applicationSource.includes("unhandledrejection")&&applicationSource.includes("reportClientError"),"global async/runtime error boundary must exist");
ok(read("public/js/api-client.js").includes('credentials:"same-origin"')&&read("public/js/api-client.js").includes('x-csrf-token'),"API client must include credentials and CSRF");
ok(fs.existsSync(path.join(root,"preview/preview-api.json"))&&read("preview/preview-api.js").length<5000,"preview fixtures must be external and preview transport small");
ok(html.includes('meta name="bw-runtime-mode" content="production"'),"production must not infer preview mode from file/protocol");
ok(!loadedScripts.some(x=>/preview-(?:data|api)\.js$/.test(x)),"production shell must not load preview fixtures or preview transport");
// Performance and service worker
ok(sw.includes('request.mode==="navigate"')&&sw.includes('url.pathname.startsWith("/api/")'),"service worker must network-first navigation and bypass API");
ok(sw.includes("event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,response.clone())))"),"static asset cache updates must be batched asynchronously");
ok(sw.includes("./js/event-delegation.js")&&!sw.includes("./js/preview-api.js")&&!sw.includes("./js/preview-data.js"),"production service-worker shell must cache delegated runtime and exclude preview-only modules");
// Accessibility: actual page markup only (scripts/templates excluded)
for(const tag of stripScripts.matchAll(/<(input|select|textarea)\b[^>]*>/gi)){
 const raw=tag[0];if(/type=["']hidden["']/i.test(raw))continue;const id=(raw.match(/\bid=["']([^"']+)["']/i)||[])[1];const labelled=/\baria-(?:label|labelledby)=/i.test(raw)||(id&&new RegExp(`<label\\b[^>]*\\bfor=["']${id.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}["']`,`i`).test(stripScripts));ok(!!labelled,`form control ${id||raw.slice(0,40)} must have an accessible name`)
}
for(const modal of stripScripts.matchAll(/<[^>]+class=["'][^"']*\bmodal\b[^"']*["'][^>]*>/gi)){const raw=modal[0];ok(/\brole=["']dialog["']/i.test(raw)&&/\baria-modal=["']true["']/i.test(raw)&&/\baria-(?:label|labelledby)=/i.test(raw),"modal must have dialog semantics and accessible name")}
ok(applicationSource.includes("modalFocusable")&&applicationSource.includes('e.key==="Escape"')&&applicationSource.includes('e.key!=="Tab"'),"modal keyboard focus management must exist");
// Server authorization gate
const fetchStart=worker.indexOf("async fetch(req,env,ctx)"),gate=worker.indexOf('if(url.pathname.startsWith("/api/"))',fetchStart);ok(fetchStart>0&&gate>fetchStart,"central API gate must exist inside Worker fetch");
const protectedBlock=worker.slice(gate,gate+2500);ok(protectedBlock.includes("const a=await auth(req,env)")&&protectedBlock.includes("requestOriginAllowed")&&protectedBlock.includes("mutationCsrfOk")&&protectedBlock.includes("restrictedWorkspaceReadAllowed")&&protectedBlock.includes("restrictedWorkspaceMutationAllowed"),"central API gate must enforce auth, origin, CSRF and role permissions");
const pre=worker.slice(fetchStart,gate);for(const required of ["verifyWhatsAppWebhookSignature","verifyWebhookSecret","x-billing-secret","x-operations-secret","oauth_state_"])ok(pre.includes(required),`pre-auth route protection ${required} must remain present`);
ok(!pre.includes('url.pathname==="/api/state"')&&!pre.includes('url.pathname==="/api/employees"')&&!pre.includes('url.pathname==="/api/evidence/integrity"'),"business data routes must not execute before the central auth gate");
// External configuration
ok(fs.existsSync(path.join(root,"cloudflare/seeds/botswana-foundation-pack-v1.json"))&&fs.existsSync(path.join(root,"cloudflare/src/generated/foundation-pack-v1.js")),"foundation pack must have external source and generated runtime module");
ok(!worker.includes("const BOTSWANA_FOUNDATION_PACK_V1={"),"Worker must not contain duplicated foundation-pack JSON");
ok(fs.existsSync(path.join(root,"preview/preview-api.json"))&&!fs.existsSync(path.join(root,"public/config/preview-api.json")),"preview data must live outside the production static asset directory");
// Browser headers
ok(worker.includes("content-security-policy")&&worker.includes("permissions-policy")&&worker.includes("x-frame-options")&&worker.includes("referrer-policy"),"browser security headers must be explicit");
console.log(`V78 1.21.47 production hardening adversarial gate: ${checks}/${checks} PASS`);
