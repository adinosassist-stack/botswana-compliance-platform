/** Web-only synthetic notification feedback acceptance.
 * Real Chromium, fabricated job records. Not physical Android or native 200% zoom.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,"playwright")
  :"playwright-core");
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,
  "/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium"]
  .filter(Boolean).find(p=>fs.existsSync(p));
const browser=await chromium.launch({headless:true,executablePath,
 args:["--no-sandbox","--disable-dev-shm-usage"]});
const css=fs.readFileSync("public/assets/delivery-reminder-notifications.css","utf8");
const runtime=fs.readFileSync("public/js/delivery-reminders-manager.js","utf8");
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  +'<style>*{box-sizing:border-box}body{margin:0}#mobileRail{position:fixed;bottom:0;left:0;right:0;height:86px;background:#ddd}</style>'
  +'<style>'+css+'</style></head><body><main id="dailyreports"></main>'
  +'<nav id="mobileRail" class="mobilebar"></nav><script>'+runtime+'</script></body></html>';
const sizes=[[320,240],[375,280],[667,375],[768,375],[390,844]];
try{
 for(const [width,height] of sizes){
  const page=await browser.newPage({viewport:{width,height}});
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  try{
   await page.addInitScript(()=>{
    window.BW={api:{createClient:()=>({request:async()=>({
     deliveryReminders:[{locationId:"synthetic-only",employeeId:"fake-worker",
      jobType:"delivery",jobReference:"TEST-COMPACT-STATUS",
      scheduledDate:"2026-11-24",locationName:"Long synthetic operations location label for readability",
      employeeName:"Synthetic reporter",daysUntil:1}]
    })})}};
   });
   await page.route("http://compact-notifications.test/**",route=>
     route.fulfill({contentType:"text/html",body:html}));
   await page.goto("http://compact-notifications.test/",{waitUntil:"load"});
   const bell=page.locator("#thebeDeliveryManagerBell");
   await page.waitForFunction(()=>document.getElementById("thebeDeliveryManagerBell")?.dataset.count==="1",null,{timeout:10000});
   await bell.click();
   const sheet=page.locator("#thebeDeliveryManagerPopup");
   await sheet.waitFor({state:"visible"});
   const footer=sheet.locator(".thebe-delivery-sheet-footer");
   const status=sheet.locator("#thebeDeliveryActionStatus");
   const compact=height<420;
   if(compact)assert(await footer.isHidden(),"Empty feedback must not waste compact screen height");
   const read=sheet.locator(".thebe-delivery-mark-read");
   await read.click();
   assert.match(await status.innerText(),/does not complete the delivery or installation/,
    "Read action explains that delivery job itself is unchanged");
   assert(await status.isVisible(),"Action feedback is visible at "+width+"x"+height);
   assert(await footer.isVisible(),"Feedback region becomes visible at "+width+"x"+height);
   const geometry=await page.evaluate(()=>{
    const panel=document.querySelector("#thebeDeliveryManagerPopup").getBoundingClientRect();
    const feedback=document.querySelector("#thebeDeliveryActionStatus").getBoundingClientRect();
    return {panel:panel.toJSON(),feedback:feedback.toJSON(),w:innerWidth,h:innerHeight,
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      modal:document.querySelector("#thebeDeliveryManagerPopup").getAttribute("aria-modal")};
   });
   assert.equal(geometry.modal,"true");
   assert(!geometry.overflow,"No horizontal overflow: "+JSON.stringify(geometry));
   assert(geometry.panel.left>=-1&&geometry.panel.right<=width+1
     &&geometry.panel.top>=-1&&geometry.panel.bottom<=height+1,
     "Notification dialog fits viewport: "+JSON.stringify(geometry));
   assert(geometry.feedback.top>=geometry.panel.top-1
     &&geometry.feedback.bottom<=geometry.panel.bottom+1,
     "Visible action feedback stays within dialog: "+JSON.stringify(geometry));
   assert.deepEqual(errors,[],"No browser runtime errors");
  }finally{await page.close()}
 }
 console.log("PASS compact notification action-feedback visibility at 320x240, 375x280, landscape and normal mobile; synthetic browser only");
}finally{await browser.close()}
