import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {financeFixture} from './helpers/finance-input-fixture.mjs';
const executablePath=process.env.CHROME_PATH||['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser','/tmp/thebe-chromium'].find(p=>fs.existsSync(p));
assert(executablePath,'Chromium is required');
const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
const {sqlite,request}=financeFixture();
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 let failNext=false,delaySummary=false,summaryHeld=false,releaseSummary;const calls=[];
 await page.route('https://thebedesk.com/**',async route=>{
  const req=route.request();const url=new URL(req.url());
  if(url.searchParams.has('__thebe_api_path')){const logicalPath=url.searchParams.get('__thebe_api_path'),logicalQuery=url.searchParams.get('__thebe_api_query')||'';url.pathname=logicalPath;url.search=logicalQuery}else if(url.pathname.startsWith('/__thebe_api/'))url.pathname='/api/'+url.pathname.slice('/__thebe_api/'.length);
  if(url.pathname.startsWith('/api/finance/')){
   calls.push({path:url.pathname,method:req.method()});
   if(req.method()==='POST')assert.equal(req.headers()['x-csrf-token'],'test-csrf-token','writes must use the authenticated workspace CSRF transport');
   if(failNext&&req.method()==='POST'){failNext=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'temporarily_unavailable'})})}
   const response=await request(url.pathname.slice('/api/finance/'.length)+url.search,{method:req.method(),body:req.postData()||undefined,headers:req.headers()});
   const responseBody=await response.text();if(delaySummary&&url.pathname.endsWith('/summary')){delaySummary=false;summaryHeld=true;await new Promise(resolve=>{releaseSummary=resolve})}
   return route.fulfill({status:response.status,contentType:'application/json',body:responseBody});
  }
  if(url.pathname.startsWith('/js/')&&fs.existsSync('public'+url.pathname))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync('public'+url.pathname,'utf8')});
  return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0;font-family:Arial}.btn{padding:8px 11px}.view{display:none}.view.active{display:block}.hub-hero{padding:12px}</style></head><body><section id="moneyhub" class="view active"><div class="hub-hero"><h2>Money</h2></div></section><section id="propertyintelligence"><div id="protectedCalculator" style="width:280px;height:160px">Calculator</div></section></body></html>'});
 });
 await page.goto('https://thebedesk.com/app/');
 await page.addScriptTag({path:'public/js/api-client.js'});
 await page.evaluate(()=>{const client=globalThis.BW.api.createClient({getCsrfToken:()=>"test-csrf-token",retries:0});globalThis.apiJson=(path,options)=>client.request(path,options)});
 await page.addScriptTag({path:'public/js/money-workspace-v307.js'});
 await page.waitForFunction(()=>document.getElementById('moneyhub').dataset.moneyV307State==='ready');
 assert.equal(await page.getByRole('button',{name:'Add account',exact:true}).count(),0,'baseline dashboard has no input entry action');
 const before=await page.locator('#protectedCalculator').boundingBox();
 await page.addStyleTag({path:'public/assets/money-inputs-v310.css'});await page.addScriptTag({path:'public/js/money-inputs-v310.js'});
 await page.locator('.money-input-disclosure>summary').click();
 const panel=page.locator('.money-input-panel');
 async function open(label){await page.locator('.money-input-actions').getByRole('button',{name:label,exact:true}).click();await page.waitForFunction(()=>document.querySelector('.money-input-panel form')?.dataset.ready==='true')}
 async function fill(values){for(const [name,value] of Object.entries(values)){const el=page.locator('#money-input-'+name);if(await el.evaluate(e=>e.tagName==='SELECT'))await el.selectOption({label:value});else await el.fill(value)}}
 async function save(label='Save record'){await panel.getByRole('button',{name:label,exact:true}).click();await page.waitForFunction(()=>document.querySelector('.money-input-status')?.dataset.kind==='success');assert.match(await panel.locator('.money-input-status').innerText(),/Saved|Reconciliation/)}
 await open('Add account');await fill({name:'Operating bank',accountType:'bank',opening:'1000.01'});await save();
 await open('Add customer');await fill({name:'Customer A',code:'C-A'});await save();
 await open('Add supplier');await fill({name:'Supplier A',code:'S-A',category:'materials'});await save();
 await open('Add invoice');await fill({customerId:'Customer A',number:'INV-1',issuedOn:'2026-10-01',dueOn:'2026-10-07',amount:'900.03',description:'Order'});await save();
 await open('Add bill');await fill({supplierId:'Supplier A',number:'BILL-1',issuedOn:'2026-10-01',dueOn:'2026-10-07',amount:'500.02',category:'materials'});await save();
 await open('Record income');await fill({accountId:'Operating bank',postedOn:'2026-10-07',amount:'400.02',description:'Customer deposit',reference:'R1'});await save();
 await open('Record expense');await fill({accountId:'Operating bank',postedOn:'2026-10-07',amount:'200.01',description:'Supplier payment',reference:'R2'});await save();
 const summary=await (await request('summary')).json();assert.equal(summary.cashPositionMinor,120002);assert.equal(summary.receivables.outstandingMinor,90003);assert.equal(summary.payables.outstandingMinor,50002);
 await open('Link payment');await page.locator('#money-input-obligation').selectOption({label:'Invoice INV-1 · Customer A · P900.03'});await page.locator('#money-input-transactionId').selectOption({label:'2026-10-07 · Customer deposit · P400.02'});await fill({amount:'400.02'});await save('Link recorded payment');
 await open('Link payment');await page.locator('#money-input-obligation').selectOption({label:'Bill BILL-1 · Supplier A · P500.02'});await page.locator('#money-input-transactionId').selectOption({label:'2026-10-07 · Supplier payment · P200.01'});await fill({amount:'200.01'});await save('Link recorded payment');
 const matched=await (await request('summary')).json();assert.equal(matched.cashPositionMinor,120002);assert.equal(matched.receivables.outstandingMinor,50001);assert.equal(matched.payables.outstandingMinor,30001);
 assert.match(await page.locator('#moneyWorkspaceV307').innerText(),/P1,200.02/);assert.match(await page.locator('#moneyWorkspaceV307').innerText(),/P500.01/);assert.match(await page.locator('#moneyWorkspaceV307').innerText(),/P300.01/);
 await open('Record income');await fill({accountId:'Operating bank',amount:'0.001',description:'Invalid decimal',reference:'BAD'});const writeCount=calls.filter(x=>x.method==='POST').length;await panel.getByRole('button',{name:'Save record',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.money-input-status')?.dataset.kind==='error');assert.equal(calls.filter(x=>x.method==='POST').length,writeCount,'invalid precision must not reach server');
 await fill({amount:'1.25',description:'Retry-safe income'});failNext=true;await panel.getByRole('button',{name:'Save record',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.money-input-status')?.textContent.includes('temporarily_unavailable'));assert.equal(await page.locator('#money-input-amount').inputValue(),'1.25');
 delaySummary=true;await page.evaluate(()=>{void globalThis.ThebeMoneyWorkspaceV307.refresh()});for(let attempt=0;attempt<50&&!summaryHeld;attempt++)await new Promise(resolve=>setTimeout(resolve,20));assert(summaryHeld);await panel.getByRole('button',{name:'Save record',exact:true}).click();releaseSummary();await page.waitForFunction(()=>document.querySelector('.money-input-status')?.dataset.kind==='success');await page.waitForFunction(()=>document.getElementById('moneyWorkspaceV307').textContent.includes('P1,201.27'));assert.match(await page.locator('#moneyWorkspaceV307').innerText(),/P1,201.27/,'save must refresh after any older in-flight summary');
 await open('Import statement');await fill({accountId:'Operating bank'});
 const csv='date,description,amount,reference\r\n2026-10-07,"Deposit, second",30.05,R3\r\n2026-10-07,Service fee,-2.03,R4\r\n';
 await page.locator('#money-input-file').setInputFiles({name:'statement.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 const transactionsBefore=sqlite.prepare('SELECT COUNT(*) n FROM finance_transactions').get().n;
 await panel.getByRole('button',{name:'Preview import',exact:true}).click();await page.getByRole('button',{name:'Confirm import',exact:true}).waitFor();assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM finance_transactions').get().n,transactionsBefore,'preview must not persist');assert.match(await panel.innerText(),/net change P28.02/);
 await save('Confirm import');assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM finance_transactions').get().n,transactionsBefore+2);
 await open('Import statement');await fill({accountId:'Operating bank'});await page.locator('#money-input-file').setInputFiles({name:'same.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await panel.getByRole('button',{name:'Preview import',exact:true}).click();await panel.getByRole('button',{name:'Confirm import',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.money-input-status')?.dataset.kind==='error');assert.match(await panel.innerText(),/already imported/);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM finance_transactions').get().n,transactionsBefore+2);
 await open('Review records');await fill({recordType:'Recent transactions (up to 500)'});await panel.getByRole('button',{name:'Load records',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.money-record-list')?.children.length===5);assert.match(await panel.locator('.money-record-list').innerText(),/Deposit, second/);
 await open('Reconcile account');await fill({accountId:'Operating bank',statementFrom:'2026-10-07',statementTo:'2026-10-07',opening:'1000.01',closing:'1229.29'});await save('Run reconciliation');assert.match(await panel.innerText(),/Difference P0.00/);
 const parseChecks=await page.evaluate(()=>{const api=globalThis.ThebeMoneyInputsV310;const results=[];for(const text of ['date,description,amount,reference\n2026-02-30,Bad,1,X','date,description,amount,reference\n2026-10-07,Bad,0.001,X','date,description,amount,reference\n2026-10-07,"Unclosed,1,X']){try{api.parseCSV(text);results.push(false)}catch{results.push(true)}}return {results,minor:api.minor('0.29')}});assert(parseChecks.results.every(Boolean));assert.equal(parseChecks.minor,29);
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});const dimensions=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('.money-input-actions button')].map(x=>x.getBoundingClientRect().height)}));assert(dimensions.scroll<=dimensions.viewport+1,JSON.stringify(dimensions));assert(dimensions.buttons.every(x=>x>=44))}
 const after=await page.locator('#protectedCalculator').boundingBox();assert.deepEqual({width:after.width,height:after.height},{width:before.width,height:before.height},'calculator dimensions must be preserved');assert.deepEqual(errors,[]);
 if(process.env.V310_SCREENSHOT){await page.setViewportSize({width:390,height:844});await open('Add invoice');await page.screenshot({path:process.env.V310_SCREENSHOT,fullPage:true})}
 console.log('PASS: V310 browser-to-real-ledger accounts, income, expenses, invoices, bills, payment matching, exact cents, CSV review/duplicates, reconciliation, saved-record review, errors and responsive geometry');
}finally{await browser.close();sqlite.close()}
