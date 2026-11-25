import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
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


test("AI pill separates open, voice and drag controls while keeping persisted position",()=>{
 const js=read("../public/js/thebe-live-voice.js");
 const css=read("../public/assets/thebe-ai-dock.css");
 assert.ok(js.includes('pill=el("div","thebe-ai-pill")'),"pill is an accessible control group, not a nested button");
 for(const token of [
  'pillOpen=el("button","thebe-ai-pill-open")',
  'const pillMic=el("button","thebe-ai-pill-mic")',
  'const pillHandle=el("button","thebe-ai-pill-handle")',
  'pillOpen.addEventListener("click",()=>{',
  'if(mobileDockMode()){\n        setExpanded(true);\n        setCollapsed(false,expand);\n      }else setCollapsed(false);',
  'pillMic.addEventListener("click",()=>orbButton.click())',
  'pillHandle.addEventListener("pointerdown"',
  'pillHandle.addEventListener("pointermove"',
  'pillHandle.addEventListener("pointercancel"',
  'pillHandle.addEventListener("keydown"',
  'global.visualViewport?.addEventListener("resize",pillSync',
  'pill.dataset.dragPosition="true"',
  'if(mobileDockMode()&&pill?.dataset.dragPosition==="true"'
 ])assert.ok(js.includes(token),"missing independent pill interaction "+token);
 assert.match(js,/pillHandle\.setPointerCapture\?\.\(event\.pointerId\)/);
 assert.match(js,/pillHandle\.setAttribute\("aria-keyshortcuts"/);
 assert.match(js,/global\.localStorage\?\.setItem\(positionKey/);
 assert.match(css,/#thebeAiDockPill \.thebe-ai-pill-handle\{/);
 assert.match(css,/touch-action:none/);
 assert.match(css,/body\.thebe-delivery-sheet-open #thebeAiDockPill/);
 assert.doesNotMatch(css.slice(css.lastIndexOf("/* #2813: compact charcoal AI launcher")),/linear-gradient\(/);
});

test("compact notification cap uses actual visual viewport and never exposes the rail beneath its modal",()=>{
 const css=read("../public/assets/delivery-reminder-notifications.css");
 const js=read("../public/js/delivery-reminders-manager.js");
 const section=css.slice(css.lastIndexOf("/* #2813: compact notification reading sheet"));
 assert.ok(section.includes("max-height:min(72dvh,560px"),"content-height cap is bounded");
 assert.ok(section.includes("var(--thebe-vv-height"),"keyboard visual viewport bounds the sheet");
 assert.ok(section.includes("overflow-y:auto"),"notification body is separately scrollable");
 assert.ok(section.includes('.thebe-delivery-manager-popup[hidden]{display:none!important}'));
 assert.ok(js.includes('panel.style.setProperty("--thebe-vv-height",height+"px")'));
 assert.ok(css.includes("visibility:hidden!important;pointer-events:none!important"),"foreground sheet hides the background navigation rail");
 assert.doesNotMatch(section,/thebe-delivery-sheet-open[\s\S]*visibility:visible!important/,"do not show navigation behind notification");
});


test("Daily Reports exposes expected, received and missing counts on each branch card and clears failed reads",()=>{
 const js=read("../public/js/workspace-runtime-20261001b.js");
 const html=read("../public/index.html");
 for(const source of [js,html]){
  assert.ok(source.includes('metric("Expected",value(expected))'));
  assert.ok(source.includes('metric("Received",value(received))'));
  assert.ok(source.includes('metric("Missing",value(missing))'));
  assert.ok(source.includes('expected-received:null'));
  assert.ok(source.includes('if(dashboardR.status==="fulfilled")applyOpsDashboard(dashboard);else clearOpsDashboard();'));
  assert.ok(source.includes('company!==store.activeCompanyId||role!==currentWorkspaceRole()'));
  assert.ok(source.includes('startsWith("/api/daily-reporting/dashboard?"))throw error'));
 }
 assert.ok(html.includes('id="ops-branch-report-cards-2715"'));
});


test("branch roll-up distinguishes missing, optional and excused reports without hiding metrics",()=>{
 const js=read("../public/js/workspace-runtime-20261001b.js");
 const source=js.slice(js.indexOf("function renderOpsBranches("),js.indexOf("\nfunction renderOpsMissing("));
 const node={safeHTML:""};
 const ctx=vm.createContext({document:{getElementById:()=>node},escapeHtml:s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])),moneyBwp:n=>"P"+n,trendLabel:n=>String(n)});
 vm.runInContext(source,ctx);
 ctx.rows=[{name:"<Gaborone>",expected:3,submittedExpected:1,submitted:2,excused:1,coverage:33,revenue:123,tasks:2,customers:1,incidents:0,attention:1},{name:"Maun",expected:0,submittedExpected:0,submitted:0,excused:2,coverage:0},{name:"Unknown",expected:3}];
 vm.runInContext("renderOpsBranches(rows)",ctx);
 assert.match(node.safeHTML,/&lt;Gaborone&gt;/);assert.doesNotMatch(node.safeHTML,/<Gaborone>/);
 assert.match(node.safeHTML,/<small>Expected<\/small><b>3<\/b>/);
 assert.match(node.safeHTML,/<small>Received<\/small><b>1<\/b>/);
 assert.match(node.safeHTML,/<small>Missing<\/small><b>2<\/b>/);
 assert.match(node.safeHTML,/Optional reports: 1 · Not expected: 1/);
 assert.match(node.safeHTML,/No reports expected/);assert.match(node.safeHTML,/Reporting status unavailable/);
 for(const label of ["Tasks","Customers / jobs","Revenue","Incidents","Attention"])assert.ok(node.safeHTML.includes("<small>"+label+"</small>"));
 vm.runInContext("renderOpsBranches(null)",ctx);assert.match(node.safeHTML,/unavailable/);
 vm.runInContext("renderOpsBranches([])",ctx);assert.match(node.safeHTML,/No locations returned/);
});

test("incomplete or failed dashboard clears numbers and follow-up instead of showing success",()=>{
 const js=read("../public/js/workspace-runtime-20261001b.js");
 const source=js.slice(js.indexOf("function applyOpsDashboard("),js.indexOf("let opsLiveRefreshInFlight="));
 const nodes=new Map();
 const get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:"old",style:{},safeHTML:"old"});return nodes.get(id)};
 let applied=0;
 const ctx=vm.createContext({document:{getElementById:get},setText:(id,v)=>get(id).textContent=String(v),renderOpsBranches:()=>applied++,renderOpsMissing:()=>applied++,renderOpsExceptions:()=>applied++,renderOpsReports:()=>applied++,setTimeout:()=>{}});
 vm.runInContext(source,ctx);
 vm.runInContext("applyOpsDashboard({})",ctx);
 assert.equal(applied,0);assert.equal(get("opsVisualExpected").textContent,"—");assert.match(get("opsMissingReports").textContent,/unavailable/);
 vm.runInContext("applyOpsDashboard({branches:[],reports:[],missing:[],exceptions:[],reportingPopulation:{expected:0},coverage:0})",ctx);
 assert.equal(applied,4);assert.equal(get("opsVisualExpected").textContent,"0");
 vm.runInContext("clearOpsDashboard()",ctx);assert.equal(get("opsCoverage").textContent,"—");assert.equal(get("opsReportingExceptionsWrap").style.display,"none");
});
