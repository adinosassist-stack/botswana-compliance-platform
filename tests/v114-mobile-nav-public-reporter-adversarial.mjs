import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync("public/index.html","utf8");
const styles=fs.readFileSync("public/assets/workspace-inline-styles-20260923a.css","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const redirect=fs.readFileSync("public/js/reporter-link-redirect.js","utf8");
const reportHtml=fs.readFileSync("public/report/index.html","utf8");
const reportJs=fs.readFileSync("public/js/employee-reporting-portal.js","utf8");
const wrangler=fs.readFileSync("cloudflare/wrangler.toml","utf8");
const synthetic=fs.readFileSync("scripts/production-synthetic-full-user-wrapper.mjs","utf8");

// Pass 1: mobile navigation must not cover readable workspace content.
for(const source of [html,styles]){
  assert.ok(source.includes("padding:12px 10px calc(128px + env(safe-area-inset-bottom))!important"),"mobile workspace must reserve space below the floating navigation");
  assert.ok(source.includes("background:#fff!important;box-shadow:0 14px 38px rgba(10,20,14,.22)!important;isolation:isolate"),"mobile navigation must be opaque and isolated from page text");
  assert.ok(source.includes("body.mobile-nav-open .mobilebar{opacity:0!important;visibility:hidden!important;pointer-events:none!important}"),"bottom navigation must leave the way when the full drawer opens");
  assert.ok(source.includes("background:rgba(5,10,7,.72)"),"mobile drawer backdrop must visually separate menu from page content");
}
assert.ok(html.includes('document.getElementById("mainContent")?.setAttribute("inert","")'),"workspace content must be inert while the mobile menu is open");
assert.ok(html.includes('document.getElementById("mainContent")?.removeAttribute("inert")'),"workspace content must be restored after closing the mobile menu");

// Pass 2: employee reporting is a bearer-link public surface, not workspace authentication.
assert.ok(worker.includes("/report/#report="),"new reporting links must use the public report route");
assert.ok(redirect.includes('if(path==="/report")return'),"report redirect must preserve the public report route");
assert.ok(redirect.includes('location.replace("/report/"+hash)'),"legacy report links must redirect to the public report route");
assert.ok(wrangler.includes('"/report", "/report/*"'),"Cloudflare must route the public report surface through the Worker");
assert.ok(reportHtml.includes('id="reporterPortal"'),"dedicated reporter portal missing");
assert.ok(reportHtml.includes("No Thebe Desk account or sign-in is required."),"reporter page must clearly be passwordless");
assert.ok(!/id="authForm"|id="authGate"|id="appShell"/.test(reportHtml),"reporter page must not contain workspace authentication UI");
assert.ok(reportJs.includes('credentials:"omit"'),"reporter API calls must not depend on a signed-in session");
assert.ok(reportJs.includes('"/public/daily-reporting/access"'),"reporter access endpoint missing");
assert.ok(reportJs.includes('"/public/daily-reporting/submit"'),"reporter submit endpoint missing");
assert.ok(!reportJs.includes("/api/auth/"),"reporter client must not call authentication APIs");

// Pass 3: production lifecycle proves the boundary in a phone-sized browser.
assert.ok(synthetic.includes("viewport:{width:390,height:844}"),"mobile reporter browser proof missing");
assert.ok(synthetic.includes("mobile employee report link required or exposed workspace sign-in"),"mobile reporter sign-in regression assertion missing");
assert.ok(synthetic.includes("issued employee reporting link did not use the dedicated public report route"),"desktop reporter route assertion missing");

console.log("v114 mobile navigation and passwordless employee reporting: 3-pass PASS");
