/** Synthetic Chromium acceptance; never contacts production. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const css=fs.readFileSync('public/assets/delivery-reminder-notifications.css','utf8');
const runtime=fs.readFileSync('public/js/delivery-reminders-manager.js','utf8');
const workspace=fs.readFileSync('public/index.html','utf8');
const styles=[...workspace.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).join('\n');
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>${styles}</style></head><body><select id="companySelect"><option value="company-A">A</option><option value="company-B">B</option></select><main id="dailyreports"></main><script>${runtime}</script></body></html>`;
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].filter(Boolean).find(p=>fs.existsSync(p));
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 await context.addInitScript(()=>{
  window.currentUser={id:'owner-A',tenantId:'tenant-A'};
  window.testJobDate='2026-11-27';
  window.BW={api:{createClient:()=>({request:async()=>({deliveryReminders:[{
   sourceReportId:'report-A',locationId:'branch-A',employeeId:'worker-A',jobType:'installation',
   jobReference:'PRIVATE-JOB-123',scheduledDate:window.testJobDate,locationName:'Private branch',employeeName:'Private employee',daysUntil:0
  }]})})}};
 });
 await context.route('http://localhost/**',route=>route.fulfill({contentType:'text/html',body:html}));
 const page=await context.newPage();
 const count=async n=>page.waitForFunction(n=>document.getElementById('thebeDeliveryManagerBell')?.dataset.count===String(n),n);
 const refresh=()=>page.evaluate(()=>window.dispatchEvent(new Event('thebe:workspace-ready')));
 await page.goto('http://localhost/');await count(1);
 const panel=page.locator('#thebeDeliveryManagerPopup');
 const geometry=await panel.evaluate(el=>({width:el.getBoundingClientRect().width,padding:getComputedStyle(el).padding,height:el.getBoundingClientRect().height}));
 assert(geometry.width>=420,'Desktop panel must escape sidebar width: '+JSON.stringify(geometry));
 assert.equal(geometry.padding,'0px','Sidebar padding must not form a dark frame');
 // Real desktop pointer drag must move the pill without opening the panel.
 await panel.getByRole('button',{name:'Close reminders'}).click();
 const bell=page.locator('#thebeDeliveryManagerBell');
 const start=await bell.boundingBox();
 await page.mouse.move(start.x+start.width/2,start.y+start.height/2);
 await page.mouse.down();await page.mouse.move(220,120,{steps:6});await page.mouse.up();
 assert(await panel.isHidden(),'Dragging the desktop pill does not open notifications');
 const moved=await bell.boundingBox();
 assert(Math.abs(moved.x-start.x)>100,'Desktop notification pill actually moves');
 await page.reload();await count(1);
 const restored=await bell.boundingBox();
 assert(Math.abs(restored.x-moved.x)<2&&Math.abs(restored.y-moved.y)<2,'Desktop drag position survives reload');
 for(const width of [320,375,414,430,768]){
  await page.setViewportSize({width,height:800});
  const bounds=await panel.boundingBox();
  assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width+1,'Approved sheet fits width '+width);
  for(const selector of ['#thebeDeliveryUnread','#thebeDeliveryAll','#thebeDeliveryMarkAll','.thebe-delivery-view-task','.thebe-delivery-mark-read']){
   const box=await panel.locator(selector).boundingBox();
   assert(box&&box.height>=44,'Reachable touch target '+selector+' at '+width);
  }
 }
 await page.setViewportSize({width:1280,height:800});
 await panel.locator('.thebe-delivery-mark-read').click();await count(0);
 assert.equal(await panel.locator('.thebe-delivery-reminder').count(),0,'Unread filter removes the acknowledged reminder');
 await panel.locator('#thebeDeliveryAll').click();
 assert.equal(await panel.locator('.thebe-delivery-mark-read[aria-pressed="true"]').textContent(),'✓ Read');
 await page.waitForFunction(()=>document.getElementById('thebeDeliveryActionStatus')?.textContent.includes('Saved'));
 const stored=await page.evaluate(()=>JSON.stringify(localStorage));
 for(const privateText of ['PRIVATE-JOB-123','Private branch','Private employee','owner-A','tenant-A','company-A'])assert(!stored.includes(privateText),'No job or account details in storage');
 await page.reload();await count(0);
 await page.selectOption('#companySelect','company-B');await count(1);
 await page.selectOption('#companySelect','company-A');await count(0);
 await page.evaluate(()=>{window.currentUser.id='owner-B'});await refresh();await count(1);
 await page.evaluate(()=>{window.currentUser.id='owner-A';window.currentUser.tenantId='tenant-B'});await refresh();await count(1);
 await page.evaluate(()=>{window.currentUser.tenantId='tenant-A'});await refresh();await count(0);
 await page.evaluate(()=>{window.testJobDate='2026-11-28'});await refresh();await count(1);
 await page.evaluate(()=>{window.testJobDate='2026-11-27'});await refresh();await count(0);
 // A new tab/session on the same browser must restore the acknowledgement.
 const next=await context.newPage();await next.goto('http://localhost/');
 await next.waitForFunction(()=>document.getElementById('thebeDeliveryManagerBell')?.dataset.count==='0');
 await next.close();
 // Blocked persistence must still allow reading, with honest session-only feedback.
 await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('storage blocked')};window.testJobDate='2026-11-29'});
 await refresh();await count(1);
 await panel.locator('.thebe-delivery-mark-read').click();await count(0);
 await page.waitForFunction(()=>document.getElementById('thebeDeliveryActionStatus')?.textContent.includes('could not be saved'));
 await context.close();
 console.log('PASS approved filters and responsive controls, desktop drag and position restore, full sidebar cascade, read persistence, account/tenant/company isolation, rescheduling, private storage and blocked storage feedback');
}finally{await browser.close()}
