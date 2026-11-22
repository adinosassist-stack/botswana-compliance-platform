import assert from "node:assert/strict";
import fs from "node:fs";
import { runInNewContext } from "node:vm";

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

// Find tools transfers the mobile user from the drawer to the palette.
assert.match(product,/class="nav-more-tools" data-bw-onclick="openCommandPalette\(\)"/);
const bindNavigation = product.match(/^  function bindNavigation\(\)\{[\s\S]*?^  \}/m)?.[0];
assert.ok(bindNavigation, "mobile navigation binding must exist");
for (const mobile of [true, false]) {
  let findTools;
  let closed = 0;
  runInNewContext(bindNavigation + "\n  bindNavigation();", {
    sidebar: () => ({
      querySelector: selector => {
        assert.equal(selector, "button.nav-more-tools");
        return { addEventListener: (type, listener) => {
          assert.equal(type, "click");
          findTools = listener;
        } };
      },
      querySelectorAll: () => [],
    }),
    document: { querySelectorAll: () => [] },
    isMobile: () => mobile,
    closeMobileWorkspaceMenu: () => closed++,
  });
  assert.equal(typeof findTools, "function", "Find tools must bind the drawer handoff");
  findTools();
  assert.equal(closed, mobile ? 1 : 0);
}

console.log("v89 synthetic mobile navigation auto-close checks passed");
