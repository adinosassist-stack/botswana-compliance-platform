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
 '@media(max-width:1000px){#mobileRail{display:block;position:fixed;bottom:0;left:0;right:0;height:86px;background:#eee}}</style>' +
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
     mobile:matchMedia('(max-width:1000px)').matches,
     hitBell:!!hit?.closest('#thebeDeliveryManagerBell'),
     horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1};
   });
   const label=width+'x'+height+' '+JSON.stringify(g);
   assert(!g.horizontalOverflow,'No horizontal overflow '+label);
   assert(g.b.left>=-1&&g.b.right<=width+1&&g.b.top>=-1&&g.b.bottom<=height+1,'Bell inside viewport '+label);
   assert(g.p.left>=-1&&g.p.right<=width+1&&g.p.top>=-1&&g.p.bottom<=height+1,'Panel inside viewport '+label);
   if(g.mobile){
    assert(await bell.isVisible(),'The movable bell must stay accessible next to the open sheet '+label);
    assert(g.hitBell,'Bell keeps its tap target while sheet is open '+label);
    assert(g.p.bottom<=g.b.top-7||g.p.top>=g.b.bottom+7,
      'Sheet must be attached above or below bell without covering it '+label);
    assert(g.p.top>=-1,'Phone popup starts inside viewport '+label);
    assert(g.p.bottom<=g.rail.top-8,'Phone popup clears bottom rail '+label);
    const close=panel.getByRole('button',{name:'Close reminders'});
    assert(await close.isVisible(),'Sticky close remains reachable '+label);
    const closeBox=await close.boundingBox();
    assert(closeBox&&closeBox.y>=g.p.top-1&&closeBox.y+closeBox.height<=g.p.bottom+1,
      'Close remains inside sheet bounds '+label);
    assert(await panel.locator('h2').isVisible(),'Notification title visible '+label);
    await panel.locator('.thebe-delivery-sheet-list').evaluate(node=>node.scrollTop=node.scrollHeight);
    assert(await close.isVisible(),'Close remains visible after panel scroll '+label);
   }else{
    assert(g.hitBell,'Desktop bell remains clickable '+label);
    assert(g.p.bottom+8<=g.b.top,'Tablet/desktop popup clears bell '+label);
   }
   for(const state of ['mobile-nav-open','thebe-voice-active','thebe-ai-mobile-open']){
    await page.evaluate(name=>document.body.classList.add(name),state);
    assert.equal(await bell.isVisible(),false,'Bell yields to '+state+' at '+label);
    assert.equal(await panel.isVisible(),false,'Panel yields to '+state+' at '+label);
    await page.evaluate(name=>document.body.classList.remove(name),state);
   }
   assert(await panel.isVisible(),'Notification sheet restores after overlay '+label);
   assert(await bell.isVisible(),
     'Bell remains visible when sheet is open and yields only to Dock/voice/drawer '+label);
   assert.equal(await panel.locator('.thebe-delivery-view-task').count(),12,
     'Each synthetic reminder has a View Task action '+label);
   assert.equal(await panel.locator('.thebe-delivery-mark-read').count(),12,
     'Each synthetic reminder has a Mark as Read action '+label);
   const firstRead=panel.locator('.thebe-delivery-mark-read').first();
   await firstRead.click();
   assert.equal(await firstRead.textContent(),'Read','Reading a notification updates its actual UI state '+label);
   assert.equal(await bell.getAttribute('data-count'),'11','Unread badge decreases without changing delivery status '+label);
   assert.match(await panel.locator('#thebeDeliveryActionStatus').textContent(),/does not complete/,
     'Reading a reminder cannot falsely complete the job '+label);
   await page.evaluate(()=>{window.showView=id=>{
     window.__lastOpenedView=id;
     document.getElementById(id)?.classList.add('active');
   }});
   await panel.locator('.thebe-delivery-view-task').first().click();
   assert.equal(await page.evaluate(()=>window.__lastOpenedView),'dailyreports',
     'View Task opens the existing Daily Reports workspace '+label);
   assert(await panel.isHidden(),'View Task closes the sheet to reveal its destination '+label);
   await bell.click();
   assert(await panel.isVisible(),'Bell reopens sheet after viewing a task '+label);
   await panel.getByRole('button',{name:'Close reminders'}).click();
   assert(await panel.isHidden(),'Dismiss works '+label);
   assert(await bell.isVisible(),'Bell reappears after notification close '+label);
   const bellHit=await bell.evaluate(node=>{
     const b=node.getBoundingClientRect();
     return !!document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)?.closest('#thebeDeliveryManagerBell');
   });
   assert(bellHit,'Bell is a reachable tap target after close '+label);
   if(g.mobile){
     // Real pointer events: four corners, no drag-triggered popup, badge retained.
     for(const [targetX,targetY] of [
       [16,16],[width-16,16],[16,height-130],[width-16,height-130]
     ]){
       const before=await bell.boundingBox();
       await page.mouse.move(before.x+before.width/2,before.y+before.height/2);
       await page.mouse.down();
       await page.mouse.move(targetX,targetY,{steps:5});
       await page.mouse.up();
       assert(await panel.isHidden(),'Dragging cannot open reminders '+label);
       const moved=await bell.boundingBox();
       assert(moved.x>=7&&moved.x+moved.width<=width-7,'Dragged bell stays horizontal '+label);
       assert(moved.y>=7&&moved.y+moved.height<=height-103,'Dragged bell stays above nav '+label);
       assert.equal(await bell.getAttribute('data-count'),'12');
     }
     const saved=await bell.boundingBox();
     assert(await page.evaluate(()=>!!localStorage.getItem('thebe.delivery.bell.position.v2')));
     await page.reload({waitUntil:'load'});
     await page.waitForFunction(()=>document.getElementById('thebeDeliveryManagerBell')?.dataset.count==='12');
     const restored=await bell.boundingBox();
     assert(Math.abs(restored.x-saved.x)<=2&&Math.abs(restored.y-saved.y)<=2,
       'Bell position persists after reload '+label);
     await bell.focus();
     await page.keyboard.down('Alt');
     await page.keyboard.press('ArrowLeft');
     await page.keyboard.up('Alt');
     const keyboardMoved=await bell.boundingBox();
     assert(keyboardMoved.x<=restored.x-20,'Alt+Left repositions bell '+label);
     await page.keyboard.down('Alt');
     await page.keyboard.press('Home');
     await page.keyboard.up('Alt');
     assert(await page.evaluate(()=>!localStorage.getItem('thebe.delivery.bell.position.v2')),
       'Alt+Home resets local position '+label);
     await bell.click();
     assert(await panel.isVisible(),'Bell tap still opens after drag/reset '+label);
     await page.keyboard.press('Escape');
     assert(await panel.isHidden(),'Escape closes notification sheet '+label);
     assert(await bell.evaluate(node=>document.activeElement===node),'Focus returns to bell '+label);
   }
  }finally{await page.close()}
 }
 console.log('PASS #2715: 10 real-Chromium geometries; 12 synthetic reminders; sheet clearance, focus, pointer drag four corners, reload persistence, keyboard reset, Dock/voice/nav occlusion');
}finally{await browser.close()}
