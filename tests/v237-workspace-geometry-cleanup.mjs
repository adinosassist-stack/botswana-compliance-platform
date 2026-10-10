import fs from "node:fs";
import assert from "node:assert/strict";
const runtime=fs.readFileSync(new URL("../public/js/workspace-runtime-20261001b.js",import.meta.url),"utf8");
const index=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const peopleCss=fs.readFileSync(new URL("../public/assets/people-workspace-20261003.css",import.meta.url),"utf8");
const uiCss=fs.readFileSync(new URL("../public/assets/workspace-ui-consolidation-20261010.css",import.meta.url),"utf8");
const occurrences=(needle)=>runtime.split(needle).length-1;
assert.equal(occurrences('<style id="v17-behance-polish">'),0,"dead premium workspace polish must stay removed");
assert.equal(occurrences("/* v17 — Behance-inspired premium compliance SaaS system */"),0,"dead premium polish must stay removed");
assert.equal(occurrences("/* v18 motion system */"),1,"motion system must not be duplicated");
assert.ok(runtime.includes(".shell{grid-template-columns:232px minmax(0,1fr)}"));
assert.ok(runtime.includes("@media(max-width:1000px){.shell{grid-template-columns:1fr}aside{height:auto;position:relative;padding:11px 10px}"),"single tablet/mobile shell contract must survive");
assert.ok(runtime.includes("@media(max-width:650px){main{padding:14px 12px 32px}.top{margin:-14px -12px 14px;padding:10px 12px}"),"single compact geometry contract must survive");
assert.ok(runtime.includes("propertyintelligence"),"Property must remain workspace-resident");
assert.ok(runtime.includes("peopleops"),"People must remain workspace-resident");

// V237 follow-up: one late-loaded workspace UI contract owns final visual geometry.
assert.ok(index.includes('/assets/people-workspace-20261003.css'),"workspace must keep the stylesheet entry point used by the final UI contract");
assert.ok(peopleCss.trimStart().startsWith('@import url("/assets/workspace-ui-consolidation-20261010.css");'),"workspace UI consolidation must load before People-specific rules");
assert.ok(uiCss.includes("#appShell .btn{"),"consolidated contract must own the shared button system");
assert.ok(uiCss.includes("#appShell .card,"),"consolidated contract must own the shared container system");
assert.ok(uiCss.includes("#appShell .home-thebe-agent"),"Thebe entry surfaces must share the consolidated visual contract");
assert.ok(uiCss.includes("#appShell #propertyintelligence *"),"Property must be covered by the consolidated workspace contract");
assert.ok(uiCss.includes("background-image:none!important"),"Property containers must remain gradient-free");
assert.ok(uiCss.includes("@media(max-width:650px)"),"consolidated workspace contract must retain explicit mobile behavior");
console.log("V237_WORKSPACE_GEOMETRY_CLEANUP_PASS");
