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
 assert.match(html,/max-width:240px/);
 assert.match(html,/\.ops-primary-summary \.ops-visual-flow>span:last-child\{grid-column:1\/-1\}/);
 assert.match(html,/grid-template-columns:minmax\(0,1fr\)!important/);
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
 assert.match(js,/if\(newDue\.length && !window\.matchMedia\("\(max-width: 1000px\)"\)\.matches\)setPopupOpen\(true\)/);
 assert.match(js,/button\.addEventListener\("click",\(\)=>setPopupOpen\(popup\(\)\.hidden,true\)\)/);
});

test("mobile reminder panel reserves the bottom nav lane on portrait and landscape",()=>{
 const css=read("../public/assets/delivery-reminder-notifications.css");
 assert.match(css, /@media\(max-width:1000px\)\{\s*\.thebe-delivery-manager-bell\{\s*top:calc\(env\(safe-area-inset-top/);
 assert.ok(css.includes("bottom:calc(104px + env(safe-area-inset-bottom, 0px))"),"legacy rail reserve still applies when reading sheet is closed");
 assert.ok(css.includes("body.thebe-delivery-sheet-open"),"open mobile sheet must yield background bottom rail");
 assert.ok(css.includes("var(--thebe-vv-bottom, 0px) + env(safe-area-inset-bottom, 0px) + 8px"),"reading sheet uses visual viewport rather than clipping under rail");
 assert.ok(css.includes("max-height:none"));
 assert.ok(css.includes("@media(max-width:1000px) and (max-height:500px)"));
 assert.ok(css.includes(".thebe-delivery-manager-popup{top:calc(env(safe-area-inset-top, 0px) + 110px)}"));
 for(const state of ["mobile-nav-open","thebe-ai-expanded","thebe-voice-active"]){
   assert.ok(css.includes(`body.${state} .thebe-delivery-manager-popup`),`popup must yield to ${state}`);
   assert.ok(css.includes(`body.${state} .thebe-delivery-manager-bell`),`bell must yield to ${state}`);
 }
});

test("delivery reminders yield to the actual mobile Thebe Dock runtime state",()=>{
 const css=read("../public/assets/delivery-reminder-notifications.css");
 const dock=read("../public/js/thebe-live-voice.js");
 // The real mobile opening state is *not* the desktop-only expanded state.
 assert.match(dock,/document\.body\.classList\.toggle\("thebe-ai-mobile-open",mobile&&visible&&!isCollapsed\)/);
 assert.match(dock,/document\.body\.classList\.toggle\("thebe-ai-expanded",visible&&!mobile&&dock\.dataset\.expanded==="true"\)/);
 // A top-level rule must cover the full mobile dock breakpoint
 // where the dock is open and the reminder has a much higher z-index.
 const guard=css.match(/body\.thebe-ai-mobile-open \.thebe-delivery-manager-bell,\s*body\.thebe-ai-mobile-open \.thebe-delivery-manager-popup\s*\{\s*display:none!important;\s*\}/);
 assert.ok(guard,"actual mobile dock-open state must suppress both bell and popup");
 assert.ok(css.indexOf(guard[0])<css.indexOf("/* #2715: keep notification control"),"tablet coverage must precede the narrower mobile layout rule");
});

test("agreed notification design has movable bell, independent readable action sheet and real action controls (#2778)",()=>{
 const css=read("../public/assets/delivery-reminder-notifications.css");
 const js=read("../public/js/delivery-reminders-manager.js");
 const section=css.slice(css.indexOf("/* #2715 / #2778: Agreed"));
 assert.ok(section.includes("background:#fff"),"notification card background is plain white");
 assert.ok(!section.includes("linear-gradient("),"no gradients in notification panel");
 assert.ok(section.includes("thebe-delivery-sheet-header")&&section.includes("thebe-delivery-sheet-list"),
   "heading and independently scrolling body are part of design");
 assert.ok(section.includes("thebe-delivery-reminder-actions"),"action row must be styled");
 assert.ok(section.includes("min-height:44px"),"mobile actions must be reachable");
 assert.ok(section.includes("overflow-y:auto"),"notification card body must scroll");
 assert.ok(section.includes("visibility:hidden"),"bell yields to the fixed reading sheet and returns on close");
 for(const token of ["--thebe-vv-top","--thebe-vv-bottom","--thebe-vv-left","--thebe-vv-right"]){
  assert.ok(css.includes(token)&&js.includes(token),"viewport-fixed sheet must use "+token);
 }
 assert.ok(js.includes('view.textContent="View Task"'),"View Task opens existing Daily Reports");
 assert.ok(js.includes('read.textContent=alreadyRead?"Read":"Mark as Read"'),"Mark as Read is a real control");
 assert.ok(js.includes('window.showView("dailyreports")'),"View Task uses existing workspace router");
 assert.ok(js.includes("readReminders.add(reminderKey(item))"),"read action updates unread count");
 assert.ok(js.includes("job status changes only in Daily Reports"),"read must not pretend a job was completed");
});

test("notification bell and dismiss keep keyboard navigation and accessible state",()=>{
 const js=read("../public/js/delivery-reminders-manager.js");
 assert.ok(js.includes('button.setAttribute("aria-controls","thebeDeliveryManagerPopup")'));
 assert.ok(js.includes('button.setAttribute("aria-expanded","false")'));
 assert.ok(js.includes('toggle.setAttribute("aria-expanded",String(!panel.hidden))'));
 assert.ok(js.includes('if(event.key==="Escape"&&!panel.hidden)'));
 assert.ok(js.includes('target.focus({preventScroll:true})'));
 assert.ok(js.includes('if(!items.length)panel.hidden=true'));
});

test("movable Android bell and independent sheet keep viewport, rail and keyboard controls (#2715)",()=>{
 const css=read("../public/assets/delivery-reminder-notifications.css");
 const js=read("../public/js/delivery-reminders-manager.js");
 for(const key of ["--thebe-vv-top","--thebe-vv-bottom","--thebe-vv-left","--thebe-vv-right"]){
   assert.ok(js.includes(key),"runtime must compute visual viewport "+key);
 }
 assert.match(css,/thebe-delivery-manager-bell\[aria-expanded="true"\]\{visibility:hidden\}/);
 assert.match(js,/function positionBell\(button,x,y\)/);
 assert.match(js,/window\.visualViewport\?\.addEventListener\("resize",sync\)/);
 assert.match(js,/button\.setPointerCapture\?\.\(event\.pointerId\)/);
 assert.match(js,/if\(Math\.hypot\(dx,dy\)>7\)start\.moved=true/);
 assert.match(js,/pointercancel/);
 assert.match(js,/event\.key==="Home"/);
 assert.match(js,/localStorage\.removeItem\(bellPositionKey\)/);
 assert.match(js,/button\.setAttribute\("aria-keyshortcuts"/);
 assert.match(js,/syncBellLayout\(\)/);
});

test("foreground mobile reminder sheet respects keyboard visual viewport and restores bottom navigation (#2778)",()=>{
 const css=read("../public/assets/delivery-reminder-notifications.css");
 const js=read("../public/js/delivery-reminders-manager.js");
 assert.ok(css.includes("body.thebe-delivery-sheet-open:not(.mobile-nav-open)"));
 assert.ok(css.includes(".mobilebar,"));
 assert.ok(css.includes(".mobile-nav-occlusion{"));
 assert.ok(css.includes("visibility:hidden!important;pointer-events:none!important"));
 assert.ok(js.includes('document.body.classList.toggle("thebe-delivery-sheet-open",sheetOpen)'));
 assert.ok(js.includes('panel.setAttribute("aria-modal",String(sheetOpen))'));
 assert.ok(js.includes("panel.dataset.compactViewport=String(height<420)"));
 assert.ok(css.includes('data-compact-viewport="true"'));
 assert.ok(js.includes('title.textContent="Notifications ("+unread+")'));
 assert.ok(js.includes('title.textContent=withActions?"Upcoming delivery & installation":label(item)'));
 assert.ok(js.includes('if(event.key!=="Tab"||panel.hidden||!mobileBell())return'));
});
