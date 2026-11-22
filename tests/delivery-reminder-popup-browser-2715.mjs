/**
 * Synthetic Chromium geometry checks for the actual reminder CSS and runtime.
 * No customer data, private accounts, payments, or production requests.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
 ?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright')
 :'playwright-core');
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,
 '/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser']
 .filter(Boolean).find(file=>fs.existsSync(file));
const css=fs.readFileSync('public/assets/delivery-reminder-notifications.css','utf8');
const runtime=fs.readFileSync('public/js/delivery-reminders-manager.js','utf8');
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<style>*{box-sizing:border-box}body{margin:0}#mobileRail{display:none}' +
 '@media(max-width:620px){#mobileRail{display:block;position:fixed;bottom:0;left:0;right:0;height:86px;background:#eee}}</style>' +
 '<style>'+css+'</style></head><body><main id="dailyreports"></main><nav id="mobileRail"></nav>'+
 '<script>'+runtime+'</script></body></html>';
const viewports=[[320,640],[375,667],[414,896],[430,932],[768,1024],
 [667,375],[932,430],[768,375],[1280,375],[1280,768]];
const browser=await chromium.launch({headless:true,executablePath,
 args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
try{
 for(const [width,height] of viewports){
  const page=await browser.newPage({viewport:{width,height}});
  try{
   await page.addInitScript(()=>{
    window.BW={api:{createClient:()=>({request:async()=>({
     deliveryReminders:Array.from({length:12},(_,i)=>({
      locationId:'synthetic-'+i,employeeId:'test-'+i,
      jobType:i%2?'installation':'delivery',
      jobReference:'TEST-'+i,scheduledDate:'2026-11-24',
      locationName:'Test location',employeeName:'Synthetic person',daysUntil:i%3
     }))
    })})}};
   });
   await page.route('http://reminder-fixture.test/**',route=>route.fulfill({contentType:'text/html',body:html}));
   await page.goto('http://reminder-fixture.test/',{waitUntil:'load'});
   await page.waitForFunction(()=>document.getElementById('thebeDeliveryManagerBell')?.dataset.count==='12');
   const bell=page.locator('#thebeDeliveryManagerBell'),panel=page.locator('#thebeDeliveryManagerPopup');
   assert.equal(await bell.getAttribute('aria-label'),'Delivery and installation reminders: 12. Open reminders');
   if(await panel.isHidden())await bell.click();
   assert(await panel.isVisible(),'Reminder popup must open at '+width+'x'+height);
   assert.equal(await panel.locator('.thebe-delivery-reminder').count(),12);
   const g=await page.evaluate(()=>{
    const b=document.getElementById('thebeDeliveryManagerBell').getBoundingClientRect();
    const p=document.getElementById('thebeDeliveryManagerPopup').getBoundingClientRect();
    const rail=document.getElementById('mobileRail').getBoundingClientRect();
    const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
    return {b:b.toJSON(),p:p.toJSON(),rail:rail.toJSON(),
     mobile:matchMedia('(max-width:620px)').matches,
     hitBell:!!hit?.closest('#thebeDeliveryManagerBell'),
     horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1};
   });
   const label=width+'x'+height+' '+JSON.stringify(g);
   assert(!g.horizontalOverflow,'No horizontal overflow '+label);
   assert(g.b.left>=-1&&g.b.right<=width+1&&g.b.top>=-1&&g.b.bottom<=height+1,'Bell inside viewport '+label);
   assert(g.p.left>=-1&&g.p.right<=width+1&&g.p.top>=-1&&g.p.bottom<=height+1,'Panel inside viewport '+label);
   assert(g.hitBell,'Bell hit target works with panel open '+label);
   if(g.mobile){
    assert(g.p.top>=g.b.bottom+3,'Phone popup clears bell '+label);
    assert(g.p.bottom<=g.rail.top-8,'Phone popup clears bottom rail '+label);
   }else{
    assert(g.p.bottom+8<=g.b.top,'Tablet/desktop popup clears bell '+label);
   }
   for(const state of ['mobile-nav-open','thebe-voice-active','thebe-ai-mobile-open']){
    await page.evaluate(name=>document.body.classList.add(name),state);
    assert.equal(await bell.isVisible(),false,'Bell yields to '+state+' at '+label);
    assert.equal(await panel.isVisible(),false,'Panel yields to '+state+' at '+label);
    await page.evaluate(name=>document.body.classList.remove(name),state);
   }
   assert(await bell.isVisible(),'Bell restores after overlay '+label);
   await panel.getByRole('button',{name:'Close reminders'}).click();
   assert(await panel.isHidden(),'Dismiss works '+label);
  }finally{await page.close()}
 }
 console.log('PASS #2715 reminder UI: 10 Chromium portrait/landscape geometries, 12 synthetic records, drawer/Dock/voice occlusion, scroll lane and accessible bell');
}finally{await browser.close()}
