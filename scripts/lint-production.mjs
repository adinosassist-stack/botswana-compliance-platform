import fs from "node:fs";import path from "node:path";
const root=process.cwd(),read=p=>fs.readFileSync(path.join(root,p),"utf8");
const html=read("public/index.html"),worker=read("cloudflare/src/worker.js"),sw=read("public/sw.js"),dom=read("public/js/dom-security.js"),api=read("public/js/api-client.js"),state=read("public/js/state-store.js"),preview=read("preview/preview-api.js");
const publicFiles=["public/index.html",...fs.readdirSync(path.join(root,"public/js")).filter(x=>x.endsWith(".js")).map(x=>`public/js/${x}`)];
let checks=0;const ok=(v,m)=>{checks++;if(!v)throw new Error(`FAIL ${checks}: ${m}`)};
for(const f of publicFiles){const s=read(f);ok(!/\.innerHTML\s*=/.test(s),`${f} must not assign native innerHTML`);ok(!/\balert\s*\(/.test(s),`${f} must not use alert()`);ok(!/(^|[^.\w$])confirm\s*\(/m.test(s),`${f} must not use native confirm()`);ok(!/(^|[^.\w$])prompt\s*\(/m.test(s),`${f} must not use native prompt()`)}

// Cross-cutting browser safety rules. Keep raw transport and HTML sinks centralized.
for(const f of publicFiles){
  const s=read(f);
  ok(!/\.outerHTML\s*=/.test(s),`${f} must not assign outerHTML`);
  ok(!/\binsertAdjacentHTML\s*\(/.test(s),`${f} must not call insertAdjacentHTML()`);
  ok(!/\bdocument\.write\s*\(/.test(s),`${f} must not call document.write()`);
  ok(!/\beval\s*\(/.test(s),`${f} must not call eval()`);
  ok(!/new\s+Function\s*\(/.test(s),`${f} must not construct executable code with Function()`);
  ok(!/setAttribute\s*\(\s*["']on[a-z]+["']/i.test(s),`${f} must not create inline event attributes dynamically`);
  ok(!/javascript\s*:/i.test(s),`${f} must not contain javascript: URLs`);
  if(f!=="public/js/api-client.js")ok(!/\bfetch\s*\(/.test(s),`${f} must not bypass the centralized API transport`);
}
ok(!/localStorage\.(?:setItem|getItem|removeItem|clear)\s*\(/.test(html),"application shell must not persist app data in localStorage");
ok(!/(?:^|\s)on(?:click|change|input|submit|keydown|keyup|focus)\s*=\s*["']/im.test(html),"application shell must not contain native inline event attributes");
ok(html.includes('src="js/event-delegation.js"'),"delegated event runtime must be loaded");
ok(read("public/js/event-delegation.js").includes("ALLOWED_ACTIONS")&&read("public/js/event-delegation.js").includes("isAllowedExpression"),"delegated event runtime must use an explicit action allowlist and expression validator");
ok(worker.includes("script-src-attr 'none'"),"production CSP must disable native inline event-handler execution");

ok(html.includes('meta name="bw-runtime-mode" content="production"'),"production runtime mode must be explicit");
ok(!html.includes("const PREVIEW_API="),"preview fixtures must not live in the application shell");
ok(preview.includes("global.BW?.previewData"),"preview transport must consume external generated fixture data");
ok(dom.includes("DOMParser")&&dom.includes("replaceChildren")&&dom.includes("BLOCKED_TAGS"),"dynamic markup must flow through the sanitizer/fragment renderer");
ok(state.includes("deepFreeze")&&state.includes("State updater must return a new object"),"workspace store must enforce immutable updates");
ok(!/\bstate\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*=/.test(html),"application shell must not directly assign state properties");
ok(!/\bstore\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*=/.test(html),"application shell must not directly assign store properties");
ok(api.includes('credentials:"same-origin"')&&api.includes('x-csrf-token')&&api.includes("AbortController")&&api.includes("429,502,503,504"),"API client must enforce credentials, CSRF, timeouts and bounded retry");
const legacyServiceWorkerBoundary=sw.includes('url.pathname.startsWith("/api/")')&&sw.includes('request.mode==="navigate"')&&sw.includes('fetch(request,{cache:"no-store"})')&&!sw.includes('fallbackKey:"./"')&&!sw.includes('fallbackKey: "./"');
const decommissionedServiceWorkerBoundary=sw.includes('self.registration.unregister()')&&!sw.includes('addEventListener("fetch"')&&!sw.includes('clients.openWindow')&&!sw.includes('location.reload')&&!sw.includes('location.assign')&&!sw.includes('location.replace');
ok(legacyServiceWorkerBoundary||decommissionedServiceWorkerBoundary,"service worker must either bypass API with network-only navigation or be fully decommissioned without fetch interception/navigation side effects");
ok(!decommissionedServiceWorkerBoundary||(dom.includes("getRegistrations()")&&dom.includes("registration=>registration.unregister()")&&dom.includes('startsWith("thebe-desk-")')),"decommissioned service worker requires bounded normal-startup registration/cache cleanup");
ok(worker.includes("APP_SECURITY_HEADERS")&&worker.includes('frame-ancestors \'none\'')&&worker.includes('x-frame-options":"DENY"'),"Worker must apply browser security headers");
ok(!worker.includes("const BOTSWANA_FOUNDATION_PACK_V1={"),"Worker must not embed a hand-maintained foundation pack copy");
ok(worker.startsWith('import {BOTSWANA_FOUNDATION_PACK_V1,BOTSWANA_FOUNDATION_PACK_V1_HASH}'),"Worker must use the generated foundation-pack module");
for(const f of ["public/js/dom-security.js","public/js/event-delegation.js","public/js/notifications.js","public/js/dialog-service.js","public/js/api-client.js","public/js/state-store.js","public/js/components.js"]){ok(html.includes(`src="js/${path.basename(f)}"`),`${f} must be loaded by the production app shell`)}
ok(!html.includes('src="js/preview-data.js"')&&!html.includes('src="js/preview-api.js"'),"production app shell must not load preview-only modules");
console.log(`Production lint: ${checks}/${checks} PASS`);