import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("scripts/production-synthetic-browser-wrapper.mjs","utf8");
const product=fs.readFileSync("public/index.html","utf8");
const mobileStart=source.indexOf("const target=mobileNav.first()");
const mobileEnd=source.indexOf("const mobileResponsive=",mobileStart);
const block=source.slice(mobileStart,mobileEnd);

assert.ok(mobileStart>0&&mobileEnd>mobileStart,"mobile navigation proof block must exist");
assert.match(block,/await target\.tap\(\{timeout:10000\}\)/,"mobile proof must activate a real sidebar navigation target");
assert.match(block,/!document\.body\.classList\.contains\('mobile-nav-open'\)/,"mobile proof must require the drawer to close after navigation");
assert.match(block,/getAttribute\('aria-expanded'\)===\'false\'/,"mobile proof must require the menu button accessibility state to close");
assert.doesNotMatch(block,/mobileNavClose/,"mobile proof must not use a redundant close-button tap after navigation");
assert.match(product,/btn=>btn\.addEventListener\("click",\(\)=>\{syncMobileActive\(btn\.dataset\.view\);if\(isMobile\(\)\)closeMobileWorkspaceMenu\(\)\}\)/,"product source must continue auto-closing the drawer from sidebar navigation");

console.log("v89 synthetic mobile navigation auto-close checks passed");
