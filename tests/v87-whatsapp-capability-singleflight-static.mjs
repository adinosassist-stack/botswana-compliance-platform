import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("public/js/owner-whatsapp-prepare.js","utf8");

assert.match(source,/let capabilityRefreshPromise=null;/,"WhatsApp capability refresh must have a single-flight promise");
assert.match(source,/if\(capabilityRefreshPromise\)return capabilityRefreshPromise;/,"parallel refresh requests must join the existing capability request");
assert.match(source,/capabilityRefreshPromise=\(async\(\)=>\{/,"capability request must be owned by one in-flight promise");
assert.match(source,/try\{return await capabilityRefreshPromise\}\s*finally\{capabilityRefreshPromise=null\}/,"single-flight promise must clear after completion");
assert.match(source,/if\(roleAllowed\(\)&&!capabilityReady&&!capabilityRefreshPromise&&!busy\)void refreshCapability\(\);/,"MutationObserver-driven mounts must not recursively start capability checks");
assert.match(source,/new MutationObserver\(\(\)=>mount\(\)\)\.observe\(home,\{childList:true,subtree:true\}\)/,"regression test must cover the observer that can retrigger mount");
assert.doesNotMatch(source,/if\(roleAllowed\(\)&&!capabilityReady&&!busy\)refreshCapability\(\);/,"unsafe observer refresh guard must not return");

console.log("v87 WhatsApp capability single-flight observer checks passed");
