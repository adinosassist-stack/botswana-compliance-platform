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

// Exercise the command handler used by both clicks and keyboard selection.
const commandGo = product.match(/^function commandGo\(id\)\{.*\}$/m)?.[0];
assert.ok(commandGo, "workspace command handler must exist");
for (const { drawerOpen, viewAllowed, expected } of [
  { drawerOpen: true, viewAllowed: true, expected: ["palette", "recent", "view", "drawer"] },
  { drawerOpen: false, viewAllowed: true, expected: ["palette", "recent", "view"] },
  { drawerOpen: true, viewAllowed: false, expected: ["palette", "recent", "view"] },
]) {
  const calls = [];
  runInNewContext(commandGo + '\ncommandGo("dailyreports");', {
    closeCommandPalette: () => calls.push("palette"),
    recordRecentTool: () => calls.push("recent"),
    showView: () => { calls.push("view"); return viewAllowed; },
    document: { body: { classList: { contains: state => state === "mobile-nav-open" && drawerOpen } } },
    window: { closeMobileWorkspaceMenu: () => calls.push("drawer") },
  });
  assert.deepEqual(calls, expected);
}

console.log("v89 synthetic mobile navigation auto-close checks passed");
