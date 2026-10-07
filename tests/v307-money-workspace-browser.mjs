import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(path=>fs.existsSync(path));
assert.ok(executablePath,'no Chromium-compatible browser found');

const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(String(error?.stack||error)));
  await page.setContent(`<!doctype html><html><head><style>
    :root{--line:#e3e6e8;--muted:#6b7176;--ink:#131516}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}.view{display:none}.view.active{display:block}.btn{padding:8px 11px}.hub-hero{padding:12px}.outcome-status-strip,.outcome-grid,.notice{margin:8px}.property-calculator-v224{width:280px;height:160px}.thebe-ai-dock{position:fixed;width:320px;height:500px}
  </style></head><body>
    <section id="moneyhub" class="view active simplified-hub money-hub"><div class="hub-hero"><div><b>Money</b><h2>See the money picture first.</h2></div><button class="btn">Ask Thebe about money</button></div><div class="outcome-status-strip">Legacy status</div><div class="outcome-grid">Legacy cards</div><div class="notice">Legacy source boundary</div></section>
    <section id="propertyintelligence"><div class="property-calculator-v224" id="protectedPropertyCalculator">Protected calculator</div></section>
    <aside id="thebeAiDock" class="thebe-ai-dock"></aside><button id="thebeAiDockPill" hidden>AI</button>
  </body></html>`);
  await page.evaluate(()=>{
    globalThis.__moneyFetchMode='ready';
    globalThis.__moneyExplainPrompt='';
    globalThis.openThebeFromHome=prompt=>{globalThis.__moneyExplainPrompt=String(prompt||'')};
    const payload={
      authority:{canonical:true,providerNeutral:true,source:'finance_ledger',estimated:false},currency:'BWP',cashPositionMinor:1250500,
      accounts:[{id:'a1',name:'Operating account',account_type:'bank',balance_minor:1250500,transaction_count:42}],
      imports:{count:3,transactions:42,lastImportAt:'2026-10-07 12:15:00'},
      reconciliation:{unresolvedCount:2,unresolvedExposureMinor:12500,stale:false,lastRun:{created_at:'2026-10-07 12:20:00'}},
      receivables:{businessDate:'2026-10-07',outstandingInvoiceCount:4,outstandingMinor:800000,overdueInvoiceCount:2,overdueMinor:300000,due7dMinor:200000,overdueCustomerCount:2,customers:[{customerName:'Customer Alpha',outstandingInvoiceCount:2,outstandingMinor:500000,overdueInvoiceCount:1,overdueMinor:200000,earliestDueOn:'2026-10-01'}],invoices:[{invoiceNumber:'INV-001',customerName:'Customer Alpha',dueOn:'2026-10-01',outstandingMinor:200000,overdue:true}]},
      payables:{available:true,businessDate:'2026-10-07',outstandingPayableCount:3,outstandingMinor:450000,overduePayableCount:1,overdueMinor:100000,due7dMinor:150000,supplierCount:2,suppliers:[{supplierName:'Supplier One',outstandingPayableCount:2,outstandingMinor:300000,overduePayableCount:1,overdueMinor:100000,earliestDueOn:'2026-10-02'}],payables:[{payableNumber:'BILL-01',supplierName:'Supplier One',dueOn:'2026-10-02',outstandingMinor:100000,overdue:true,expenseCategory:'materials'}]}
    };
    globalThis.fetch=async()=>{
      if(globalThis.__moneyFetchMode==='fail')throw new TypeError('simulated finance outage');
      return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
    };
  });
  const before=await page.evaluate(()=>({property:document.getElementById('protectedPropertyCalculator').getBoundingClientRect().toJSON(),dock:document.getElementById('thebeAiDock').getBoundingClientRect().toJSON()}));
  await page.addScriptTag({path:'public/js/money-workspace-v307.js'});
  await page.waitForFunction(()=>document.getElementById('moneyhub')?.dataset.moneyV307State==='ready',null,{timeout:5000});
  const state=await page.evaluate(()=>{
    const root=document.getElementById('moneyhub'),mount=document.getElementById('moneyWorkspaceV307');
    const buttons=[...mount.querySelectorAll('button')].map(button=>button.getBoundingClientRect().height);
    const legacy=[...root.children].filter(node=>node.classList.contains('outcome-grid')||node.classList.contains('outcome-status-strip')||node.classList.contains('notice')).map(node=>getComputedStyle(node).display);
    const property=document.getElementById('protectedPropertyCalculator').getBoundingClientRect().toJSON();
    const dock=document.getElementById('thebeAiDock').getBoundingClientRect().toJSON();
    return {release:globalThis.ThebeMoneyWorkspaceV307?.release,lanes:mount.querySelectorAll('.money-v307-lane').length,text:mount.innerText,width:mount.getBoundingClientRect().width,scrollWidth:document.documentElement.scrollWidth,innerWidth,buttons,legacy,property,dock};
  });
  assert.equal(state.release,'20261007-money-workspace-v307');
  assert.equal(state.lanes,3,'three deterministic finance work lanes');
  assert.match(state.text,/Reconcile cash/);assert.match(state.text,/Collect customer money/);assert.match(state.text,/Pay suppliers deliberately/);
  assert.match(state.text,/P12,505/);assert.match(state.text,/P8,000/);assert.match(state.text,/P4,500/);
  assert.equal(state.scrollWidth<=state.innerWidth+1,true,`390px Money layout overflowed: scroll=${state.scrollWidth} viewport=${state.innerWidth}`);
  assert(state.buttons.every(height=>height>=43.5),`touch target below 44px: ${state.buttons.join(',')}`);
  assert(state.legacy.every(display=>display==='none'),'legacy AI-first Money cards must be visually superseded only after V307 mounts');
  assert.deepEqual({width:Math.round(state.property.width),height:Math.round(state.property.height)},{width:Math.round(before.property.width),height:Math.round(before.property.height)},'Property calculator geometry changed');
  assert.deepEqual({width:Math.round(state.dock.width),height:Math.round(state.dock.height)},{width:Math.round(before.dock.width),height:Math.round(before.dock.height)},'dock geometry changed');

  await page.getByRole('button',{name:'Explain with Thebe'}).tap();
  const explain=await page.evaluate(()=>globalThis.__moneyExplainPrompt);
  assert.match(explain,/canonical money position/i);assert.match(explain,/Do not invent balances/i);

  await page.evaluate(async()=>{globalThis.__moneyFetchMode='fail';await globalThis.ThebeMoneyWorkspaceV307.refresh()});
  await page.waitForFunction(()=>document.getElementById('moneyhub')?.dataset.moneyV307State==='unavailable',null,{timeout:5000});
  const unavailable=await page.locator('#moneyWorkspaceV307').innerText();
  assert.match(unavailable,/Money workspace unavailable/);assert.match(unavailable,/Do not interpret missing cash, receivables, payables or reconciliation figures as zero/);
  assert.doesNotMatch(unavailable,/P0(?:\.|\b)/,'failed source must not render a synthetic zero balance');
  assert.deepEqual(errors,[],'V307 browser page errors');
  console.log('PASS: V307 Money phone layout, deterministic finance lanes, AI secondary action, fail-closed state, Property and dock geometry');
}finally{await browser.close()}
