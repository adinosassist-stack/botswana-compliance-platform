/**
 * Synthetic combined mobile UI regression for merged #2814 / #2817.
 * This is Chromium, NOT physical Android, real microphone, or production acceptance.
 * The route never accesses thebedesk.com; all reminders and chat responses are fake.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,"playwright")
  : "playwright-core");
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,
  "/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium"]
  .filter(Boolean).find(p=>fs.existsSync(p));
const fixture=[
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
  '<link rel="stylesheet" href="/assets/thebe-ai-dock.css">',
  '<link rel="stylesheet" href="/assets/delivery-reminder-notifications.css">',
  '<link rel="stylesheet" href="/assets/workspace-audit-refinements-20261013.css">',
  '<style>*{box-sizing:border-box}body{margin:0;background:#f7f9fc}',
  '#mobileRail{position:fixed;bottom:0;left:0;right:0;height:86px;background:#dce4ee}',
  '</style></head><body>',
  '<section id="marketingGate" hidden style="display:none"></section>',
  '<section id="appShell"><h1 id="pageTitle">Daily Reports</h1>',
  '<main class="view active" id="dailyreports"></main></section>',
  '<nav id="mobileRail" class="mobilebar" aria-label="Synthetic bottom navigation"></nav>',
  '<script src="/js/thebe-live-voice.js" defer></script>',
  '<script src="/js/delivery-reminders-manager.js" defer></script>',
  '</body></html>'
].join("");
const browser=await chromium.launch({headless:true,executablePath,
  args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]});
const viewports=[[320,640],[390,844],[768,1024],[667,375]];
try {
  for(const [width,height] of viewports){
    const page=await browser.newPage({viewport:{width,height}});
    const errors=[];
    page.on("pageerror",err=>errors.push(err.message));
    try{
      await page.addInitScript(()=>{
        window.currentWorkspaceRole=()=>"owner";
        window.currentUser={role:"owner",firstName:"Synthetic"};
        window.apiJson=async()=>({answer:"Synthetic answer only",references:[]});
        window.BW={api:{createClient:()=>({request:async()=>({
          deliveryReminders:[{
            locationId:"qa-only",employeeId:"qa-reporter",jobType:"installation",
            jobReference:"FAKE-001",scheduledDate:"2026-11-24",
            locationName:"Test location",employeeName:"Fake reporter",daysUntil:1
          }]
        })})}};
      });
      await page.route("http://combined-qa.test/**",route=>{
        const pathname=new URL(route.request().url()).pathname;
        if(pathname==="/")return route.fulfill({contentType:"text/html",body:fixture});
        const file="public"+pathname;
        return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:""});
      });
      await page.goto("http://combined-qa.test/",{waitUntil:"load"});
      await page.waitForFunction(()=>document.getElementById("thebeDeliveryManagerBell")?.dataset.count==="1"
        &&document.getElementById("thebeAiDockPill")!==null,null,{timeout:12000});
      const bell=page.locator("#thebeDeliveryManagerBell");
      const pill=page.locator("#thebeAiDockPill");
      const dock=page.locator("#thebeAiDock");
      const sheet=page.locator("#thebeDeliveryManagerPopup");
      const label=width+"x"+height;
      assert(await bell.isVisible(),"Synthetic bell visible "+label);
      assert(await pill.isVisible(),"Collapsed pill visible "+label);
      const initial=await page.evaluate(()=>{
        const a=document.querySelector("#thebeAiDockPill").getBoundingClientRect();
        const b=document.querySelector("#thebeDeliveryManagerBell").getBoundingClientRect();
        const intersects=a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
        return {intersects,pill:a.toJSON(),bell:b.toJSON(),width:innerWidth,height:innerHeight};
      });
      assert(!initial.intersects,"Bell and AI pill must not overlap before interaction "+label+" "+JSON.stringify(initial));
      await bell.click();
      assert(await sheet.isVisible(),"Approved notification sheet opens "+label);
      assert.equal(await sheet.getAttribute("aria-modal"),"true","Sheet is foreground modal "+label);
      assert.equal(await sheet.locator(".thebe-delivery-sheet-header h2").textContent(),
        "Notifications 1","Unread count visible "+label);
      assert(await sheet.getByRole("button",{name:/View installation FAKE-001/}).isVisible(),
        "Real View Task control reachable "+label);
      assert(await sheet.getByRole("button",{name:"Close reminders"}).isVisible(),
        "Close control reachable "+label);
      assert.equal(await pill.isVisible(),false,"Pill yields to foreground sheet "+label);
      assert.equal(await page.locator("#mobileRail").isVisible(),false,
        "Bottom navigation yields while sheet is foreground "+label);
      const sheetBounds=await sheet.boundingBox();
      assert(sheetBounds&&sheetBounds.x>=0&&sheetBounds.x+sheetBounds.width<=width+1
        &&sheetBounds.y>=0&&sheetBounds.y+sheetBounds.height<=height+1,
        "Notification sheet fits tested viewport "+label+" "+JSON.stringify(sheetBounds));
      await sheet.locator(".thebe-delivery-mark-read").click();
      assert.equal(await bell.getAttribute("data-count"),"0","Mark as Read updates badge only "+label);
      await sheet.getByRole("button",{name:"Close reminders"}).click();
      assert(await pill.isVisible(),"Pill recovers after sheet closes "+label);
      assert(await bell.isVisible(),"Bell returns after sheet closes "+label);
      assert(await page.locator("#mobileRail").isVisible(),"Navigation returns after sheet closes "+label);

      const pillBox=await pill.boundingBox();
      assert(pillBox&&pillBox.width<=175,"Workspace launcher stays compact "+label);
      const pillOpen=pill.locator(".thebe-ai-pill-open");
      const pillMic=pill.locator(".thebe-ai-pill-mic");
      const handle=pill.locator(".thebe-ai-pill-handle");
      for(const button of [pillOpen,pillMic,handle]){
        const box=await button.boundingBox();
        assert(box&&box.width>=44&&box.height>=44,
          "Independent mobile pill control has at least 44px target "+label);
      }
      // The voice shortcut invokes the existing orb handler; prevent any actual
      // microphone start in the synthetic fixture by intercepting the orb event.
      await page.evaluate(()=>{
        window.__syntheticVoiceShortcut=0;
        document.querySelector(".thebe-ai-orb-button").addEventListener("click",event=>{
          window.__syntheticVoiceShortcut++;
          event.stopImmediatePropagation();
        },true);
      });
      await pillMic.click();
      assert.equal(await page.evaluate(()=>window.__syntheticVoiceShortcut),1,
        "Pill mic routes to governed voice control, without requesting real microphone "+label);
      await handle.focus();
      await page.keyboard.press("Alt+ArrowLeft");
      assert(await page.evaluate(()=>Boolean(localStorage.getItem("thebe-ai-pill-position-v1"))),
        "Handle keyboard movement stores device-local preference "+label);
      await pillOpen.click();
      await dock.waitFor({state:"visible"});
      assert.equal(await bell.isVisible(),false,"Bell yields to open mobile AI conversation "+label);
      assert.equal(await dock.getAttribute("data-expanded"),"true",
        "Mobile launcher opens Aura directly "+label);
      assert(await dock.locator(".thebe-aura-ribbon").isVisible(),
        "Voice-reactive Aura ribbon still mounted "+label);
      if(width<=767){
        await dock.locator("#thebeAiDockInput").focus();
        const focus=await dock.locator(".thebe-ai-compose").evaluate(el=>{
          const style=getComputedStyle(el),input=getComputedStyle(el.querySelector("textarea"));
          return {border:style.borderTopColor,innerShadow:input.boxShadow,innerOutline:input.outlineStyle};
        });
        assert(["rgb(69, 76, 86)","rgb(133, 139, 148)"].includes(focus.border),"Focused composer keeps neutral border "+label);
        assert.equal(focus.innerShadow,"none","No nested textarea focus ring "+label);
        assert.equal(focus.innerOutline,"none","No nested textarea outline "+label);
      }
      await page.evaluate(async()=>window.ThebeAiDock.ask("Synthetic question","ask"));
      assert(await dock.locator(".thebe-aura-turn").count()>0,
        "Fullscreen conversation has visible turns "+label);
      await page.evaluate(()=>{
        dispatchEvent(new CustomEvent("thebe-live-event",{detail:{event:{
          type:"input_audio_buffer.speech_started"}}}));
        dispatchEvent(new CustomEvent("thebe-live-audio-level",{
          detail:{channel:"input",level:0.75}}));
      });
      const energy=await dock.locator(".thebe-particle-orb").evaluate(el=>
        parseFloat(el.style.getPropertyValue("--thebe-aura-energy")));
      assert(energy>0.7,"Synthetic audio event reaches Aura orb "+label);
      await dock.locator(".thebe-ai-minimize").click();
      assert(await pill.isVisible(),"Minimising Aura returns to independent pill "+label);
      assert(await bell.isVisible(),"Minimising Aura returns the bell "+label);
      assert.deepEqual(errors,[],"No combined UI browser errors "+label);
    }finally{await page.close();}
  }
  console.log("PASS COMBINED MOBILE QA: synthetic notification / AI pill / Aura / bottom navigation coexistence at 320, 390, 768 and landscape. NOT physical Android acceptance.");
}finally{await browser.close();}
