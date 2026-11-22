import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
test("daily reports keeps stable metric IDs and accessible compact KPI labels",()=>{
 const shard=JSON.parse(read("../public/assets/workspace-view-fragments-20261001a-6.json"));
 const html=shard.views.dailyreports;
 for(const id of ["opsVisualExpected","opsVisualReceived","opsVisualFollowup","opsCoverage","opsReportDate","opsLocationFilter","opsCoverageTrack"])
   assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/aria-label="Reporting status"/);
 assert.match(html,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(html,/max-width:360px/);
});
test("delivery reminder bell exposes count and avoids mobile bottom rail",()=>{
 const css=read("../public/assets/delivery-reminder-notifications.css");
 const js=read("../public/js/delivery-reminders-manager.js");
 assert.match(css,/\.thebe-delivery-manager-bell\{[\s\S]*?top:calc\(env\(safe-area-inset-top/);
 assert.match(css,/bottom:auto/);
 assert.match(css,/content:attr\(data-count\)/);
 assert.match(js,/toggle\.dataset\.count=/);
 assert.match(js,/toggle\.setAttribute\("aria-label"/);
});

test("quotation sidebar entry has fallback when Money Hub is absent and remains server gated",()=>{
 const js=read("../public/js/components.js");
 assert.match(js,/if\(after\)after\.after\(button\);else nav\.append\(button\)/);
 assert.match(js,/roleLabel\.textContent\.trim\(\)\.toLowerCase\(\)==="owner"/);
 assert.match(js,/documentStart\.includes\("<title>Customer quotation \| Thebe Desk<\/title>"\)/);
 assert.match(js,/min-height:48px!important/);
});

test("mobile delivery reminder does not auto-open over workspace navigation",()=>{
 const js=read("../public/js/delivery-reminders-manager.js");
 assert.match(js,/if\(newDue\.length && !window\.matchMedia\("\(max-width: 620px\)"\)\.matches\)popup\(\)\.hidden=false/);
 assert.match(js,/button\.addEventListener\("click",\(\)=>\{const panel=popup\(\);panel\.hidden=!panel\.hidden\}\)/);
});

test("mobile reminder panel reserves the bottom nav lane on portrait and landscape",()=>{
 const css=read("../public/assets/delivery-reminder-notifications.css");
 assert.ok(css.includes("bottom:calc(104px + env(safe-area-inset-bottom, 0px))"));
 assert.ok(css.includes("max-height:none"));
 assert.ok(css.includes("@media(max-width:620px) and (max-height:500px)"));
 assert.ok(css.includes(".thebe-delivery-manager-popup{top:calc(env(safe-area-inset-top, 0px) + 110px)}"));
 for(const state of ["mobile-nav-open","thebe-ai-expanded","thebe-voice-active"]){
   assert.ok(css.includes(`body.${state} .thebe-delivery-manager-popup`),`popup must yield to ${state}`);
   assert.ok(css.includes(`body.${state} .thebe-delivery-manager-bell`),`bell must yield to ${state}`);
 }
});
