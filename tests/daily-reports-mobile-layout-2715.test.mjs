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
 assert.match(js,/if\(newDue\.length && !window\.matchMedia\("\(max-width: 1000px\)"\)\.matches\)setPopupOpen\(true\)/);
 assert.match(js,/button\.addEventListener\("click",\(\)=>setPopupOpen\(popup\(\)\.hidden,true\)\)/);
});

test("mobile reminder panel reserves the bottom nav lane on portrait and landscape",()=>{
 const css=read("../public/assets/delivery-reminder-notifications.css");
 assert.match(css, /@media\(max-width:1000px\)\{\s*\.thebe-delivery-manager-bell\{\s*top:calc\(env\(safe-area-inset-top/);
 assert.ok(css.includes("bottom:calc(104px + env(safe-area-inset-bottom, 0px))"));
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

test("mobile delivery popup keeps accessible bell and bottom rail on zoom (#2778)",()=>{
 const css=read("../public/assets/delivery-reminder-notifications.css");
 const section=css.slice(css.indexOf("/* #2778:"));
 assert.ok(section.includes("100dvh - 478px"),"bell and panel adapt to dynamic viewport");
 assert.ok(section.includes("100vh - 478px"),"legacy viewport fallback remains");
 assert.ok(section.includes("bottom:calc(104px + env(safe-area-inset-bottom, 0px))"),"bottom navigation clearance");
 assert.ok(section.includes("overflow-y:auto")&&section.includes("-webkit-overflow-scrolling:touch"));
 assert.ok(section.includes("position:sticky;top:0"),"heading and close stay visible");
 assert.ok(section.includes("font-size:14px;line-height:1.5"),"readable message details");
 assert.ok(section.includes("min-width:44px;min-height:44px"),"touch accessible close");
 assert.ok(section.includes("overflow-wrap:anywhere"),"long job references wrap");
 // Model CSS clamp geometry. Bell and sheet rise as a pair so the bell stays
 // independently clickable while the sheet remains above the bottom rail.
 for(const viewport of [
  {width:320,height:640},{width:320,height:568},{width:375,height:667},
  {width:414,height:896},{width:430,height:932},{width:768,height:1024},
  {width:667,height:375},{width:932,height:430},{width:768,height:375},
  {width:375,height:320}
 ]){
  const bellTop=Math.max(8,Math.min(viewport.height-478,162));
  const panelTop=bellTop+48;
  const panelBottom=viewport.height-104;
  assert.ok(panelTop>=bellTop+47,
    `bell must stay accessible at ${viewport.width}x${viewport.height}`);
  assert.ok(panelBottom<=viewport.height-94,
    `sheet must clear the nav lane at ${viewport.width}x${viewport.height}`);
  assert.ok(panelBottom-panelTop>=120,
    `sheet must remain usable at ${viewport.width}x${viewport.height}`);
 }
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
   assert.ok(css.includes(key),"notification sheet must use "+key);
   assert.ok(js.includes(key),"runtime must update "+key);
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
