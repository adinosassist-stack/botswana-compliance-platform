import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync("public/index.html","utf8");
const styles=fs.readFileSync("public/assets/workspace-inline-styles-20260924b.css","utf8");
const uxStyles=fs.readFileSync("public/assets/workspace-ui-ux-10.css","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const redirect=fs.readFileSync("public/js/reporter-link-redirect.js","utf8");
const reportHtml=fs.readFileSync("public/report/index.html","utf8");
const reportJs=fs.readFileSync("public/js/employee-reporting-portal.js","utf8");
const wrangler=fs.readFileSync("cloudflare/wrangler.toml","utf8");
const synthetic=fs.readFileSync("scripts/production-synthetic-full-user-wrapper.mjs","utf8");

// Pass 1: mobile navigation must not cover readable workspace content.
for(const source of [html,styles]){
  assert.ok(source.includes("height:calc(100dvh - 96px - env(safe-area-inset-bottom))!important"),"mobile workspace must reserve a structural viewport zone above the bottom navigation");
  assert.ok(source.includes("@media (max-width:1000px){"),"hardened mobile navigation must cover the full breakpoint where the bottom bar is enabled");
  assert.ok(source.includes('#mainContent::after{content:"";display:block;width:100%;height:20px'),"mobile workspace must keep a small in-scroll terminal spacer");
  assert.ok(source.includes("background:#fff!important;box-shadow:0 14px 38px rgba(10,20,14,.22)!important;isolation:isolate"),"mobile navigation must be opaque and isolated from page text");
  assert.ok(source.includes(".mobile-nav-occlusion{display:block;position:fixed;z-index:179;left:0;right:0;bottom:0;height:calc(96px + env(safe-area-inset-bottom));background:#fff"),"an opaque reserved dock zone must prevent page text from showing beneath or around the navigation");
  assert.ok(source.includes("body.mobile-nav-open .mobile-nav-occlusion{display:none!important}"),"bottom shield must leave the way when the full drawer opens");
  assert.ok(source.includes("body.mobile-nav-open .mobilebar{opacity:0!important;visibility:hidden!important;pointer-events:none!important}"),"bottom navigation must leave the way when the full drawer opens");
  assert.ok(source.includes("background:#0b0f0d;backdrop-filter:none"),"mobile drawer backdrop must be fully opaque so workspace text cannot bleed underneath");
  assert.ok(source.includes("pointer-events:none;transition:none"),"mobile drawer backdrop must become fully opaque immediately without a fade-in window");
  assert.ok(source.includes("body.mobile-nav-open #mainContent{visibility:hidden!important}"),"workspace text must not remain visible below the open mobile drawer");
  assert.ok(source.includes("#workspaceSidebar{display:flex!important;position:fixed!important;z-index:220!important")&&source.includes(".mobile-nav-backdrop{display:block;position:fixed;z-index:210"),"drawer layering must keep the sidebar above the opaque backdrop and all workspace text below it");
}
assert.ok(uxStyles.includes("#appShell .mobilebar{")&&uxStyles.includes("background:#fff!important")&&uxStyles.includes("background-color:#fff!important")&&uxStyles.includes("backdrop-filter:none!important"),"production UX override must keep the wide-mobile bottom navigation fully opaque");
assert.ok(!uxStyles.includes("background:rgba(255,255,255,.96)!important"),"production UX override must not reintroduce translucent wide-mobile navigation");
assert.ok(html.includes('/assets/workspace-ui-ux-10.css?v=20260924b'),"workspace UX stylesheet cache token must rotate with the opacity fix");
assert.ok(html.includes('document.getElementById("mainContent")?.setAttribute("inert","")'),"workspace content must be inert while the mobile menu is open");
assert.ok(html.includes('document.getElementById("mainContent")?.removeAttribute("inert")'),"workspace content must be restored after closing the mobile menu");
assert.ok(html.includes("const MOBILE_MAX=1000;"),"mobile drawer runtime breakpoint must match the 1000px CSS/bottom-navigation breakpoint");

// Pass 2: employee reporting is a bearer-link public surface, not workspace authentication.
assert.ok(worker.includes("/report/?entry=employee&v=20260923e#report="),"new reporting links must use the cache-busted public report route");
assert.ok(redirect.includes('if(path==="/report")return'),"report redirect must preserve the public report route");
assert.ok(redirect.includes('location.replace("/report/?entry=legacy-link&v=20260923e"+hash)'),"legacy report links must redirect to the cache-busted public report route");
assert.ok(wrangler.includes('"/report", "/report/*"'),"Cloudflare must route the public report surface through the Worker");
assert.ok(reportHtml.includes('id="reporterPortal"'),"dedicated reporter portal missing");
assert.ok(reportHtml.includes("No Thebe Desk account or sign-in is required."),"reporter page must clearly be passwordless");
assert.ok(!/id="authForm"|id="authGate"|id="appShell"/.test(reportHtml),"reporter page must not contain workspace authentication UI");
assert.ok(html.includes('id="employee-report-entry-guard"')&&html.includes('/report/?entry=legacy-mobile&v=20260923e'),"legacy mobile report links must redirect before the workspace document renders");
assert.ok(reportHtml.includes('id="reporter-browser-recovery"'),"reporter portal must retire stale Thebe Desk browser caches/service workers");
assert.ok(worker.includes('"cache-control","no-store, max-age=0, must-revalidate"'),"report route must be served no-store");
assert.ok(reportHtml.includes('/js/api-client.js?v=20260920a'),"reporter page must load the centralized API transport");
assert.ok(reportJs.includes("BW?.api?.createClient"),"reporter API calls must use the centralized API transport");
assert.ok(!reportJs.includes("fetch("),"reporter client must not bypass the centralized API transport");
assert.ok(reportJs.includes('"/public/daily-reporting/access"'),"reporter access endpoint missing");
assert.ok(reportJs.includes('"/public/daily-reporting/submit"'),"reporter submit endpoint missing");
assert.ok(!reportJs.includes("/api/auth/"),"reporter client must not call authentication APIs");

// Pass 3: production lifecycle proves the boundary in a phone-sized browser.
assert.ok(synthetic.includes("viewport:{width:390,height:844}"),"mobile reporter browser proof missing");
assert.ok(synthetic.includes("setViewportSize({width:844,height:390})"),"wide-mobile landscape navigation proof missing");
assert.ok(synthetic.includes("wide-mobile navigation occlusion"),"wide-mobile dock/drawer occlusion assertion missing");
assert.ok(synthetic.includes("Math.abs(rect.left)<=1&&rect.width>0&&rect.right>0"),"wide-mobile drawer proof must wait for fully rendered sidebar geometry instead of racing the slide animation");
assert.ok(synthetic.includes("wide-mobile drawer state stress"),"wide-mobile proof must stress repeated reopen, Escape, orientation and breakpoint state recovery");
assert.ok(synthetic.includes("!main.hasAttribute('inert')"),"wide-mobile close proof must confirm workspace interactivity is restored");
assert.ok(synthetic.includes("button.getAttribute('aria-expanded')==='false'"),"wide-mobile close proof must confirm menu accessibility state is restored");
assert.ok(synthetic.includes("mobile employee report link required or exposed workspace sign-in"),"mobile reporter sign-in regression assertion missing");
assert.ok(synthetic.includes('#peopleops [data-bw-onclick="addOpsLocation()"]:visible'),"synthetic lifecycle must create locations through the People-owned reporting setup");
assert.ok(synthetic.includes('#peopleops [data-bw-onclick="createOpsReporterLink()"]:visible'),"synthetic lifecycle must create reporting links through the People-owned reporting setup");
assert.ok(!synthetic.includes('#dailyreports [data-bw-onclick="addOpsLocation()"]:visible'),"synthetic lifecycle must not regress to hidden Daily Reports reporting controls");
assert.ok(!synthetic.includes('#dailyreports [data-bw-onclick="createOpsReporterLink()"]:visible'),"synthetic lifecycle must not regress reporting-link creation to Daily Reports");
assert.ok(synthetic.includes("issued employee reporting link did not use the dedicated public report route"),"desktop reporter route assertion missing");

console.log("v114 mobile navigation and passwordless employee reporting: 3-pass PASS");
