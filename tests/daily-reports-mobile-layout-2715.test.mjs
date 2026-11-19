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
