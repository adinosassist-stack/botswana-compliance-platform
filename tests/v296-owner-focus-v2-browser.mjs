import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(p=>fs.existsSync(p));
const fixture=`<!doctype html><html><head><meta charset="utf-8"></head><body>
<main id="mainContent">
  <section id="ownerCommandCentre">
    <div class="owner-command-head"><h2>Owner command centre</h2></div>
    <section id="ownerAttentionPanel">
      <div class="owner-panel-head"><span class="badge">4</span></div>
      <div class="owner-review-inbox"><div class="section-eyebrow">Owner approval inbox</div><article class="owner-review-row"><b>Approve supplier plan</b><button type="button">Record approval</button></article></div>
      <div class="owner-outcome-loop"><div class="section-eyebrow">Measured outcomes</div><article class="owner-outcome-row"><b>Pricing change</b><div class="owner-outcome-actions"><button type="button">resolved</button></div></article><div class="owner-outcome-history"><div>Previous outcome</div></div></div>
      <div class="owner-attention-list"><article class="owner-attention-item">Cash gap</article><article class="owner-attention-item">Late licence</article><article class="owner-attention-item">Sales follow-up</article></div>
    </section>
  </section>
  <div id="propertyCalculator" style="position:absolute;left:10px;top:20px;width:100px;height:50px">Calculator</div>
</main>
<button id="thebeAiDockPill" type="button">Open Thebe</button>
<div id="thebeAiDock" data-surface="workspace"><textarea aria-label="Ask Thebe"></textarea></div>
<script src="/js/owner-focus-strip-v296.js"></script>
</body></html>`;

const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://localhost/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/')return route.fulfill({contentType:'text/html',body:fixture});
    if(pathname==='/js/owner-focus-strip-v296.js')return route.fulfill({contentType:'application/javascript',path:'public/js/owner-focus-strip-v296.js'});
    return route.fulfill({status:404,body:''});
  });
  await page.goto('http://localhost/');
  await page.waitForFunction(()=>document.documentElement.dataset.ownerFocusStrip==='20261007-owner-focus-v2-v296');
  await page.waitForSelector('#ownerFocusStrip');

  const values=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#ownerFocusStrip [data-focus-metric]')].map(node=>[node.dataset.focusMetric,node.querySelector('.owner-focus-value')?.textContent])));
  assert.deepEqual(values,{action:'3',approvals:'1',outcomes:'1'},'V296 metrics must preserve governed queue math');

  const calculatorBefore=await page.locator('#propertyCalculator').evaluate(node=>({style:node.getAttribute('style'),rect:{left:node.getBoundingClientRect().left,top:node.getBoundingClientRect().top,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height}}));

  await page.locator('[data-focus-metric="approvals"]').click();
  const approvalState=await page.evaluate(()=>({
    filter:document.querySelector('#ownerAttentionPanel')?.dataset.ownerFocusFilter||'',
    pressed:document.querySelector('[data-focus-metric="approvals"]')?.getAttribute('aria-pressed'),
    attentionDisplay:getComputedStyle(document.querySelector('.owner-attention-list')).display,
    reviewDisplay:getComputedStyle(document.querySelector('.owner-review-inbox')).display,
    outcomeDisplay:getComputedStyle(document.querySelector('.owner-outcome-loop')).display,
    activeTag:document.activeElement?.className||''
  }));
  assert.equal(approvalState.filter,'approvals');
  assert.equal(approvalState.pressed,'true');
  assert.equal(approvalState.attentionDisplay,'none');
  assert.notEqual(approvalState.reviewDisplay,'none');
  assert.equal(approvalState.outcomeDisplay,'none');
  assert.match(approvalState.activeTag,/owner-review-row/,'approval filter should focus the first governed review row');

  await page.locator('[data-focus-metric="approvals"]').click();
  assert.equal(await page.locator('#ownerAttentionPanel').getAttribute('data-owner-focus-filter'),null,'second click must return to the all-priorities view');

  await page.locator('[data-focus-metric="outcomes"]').click();
  const outcomeState=await page.evaluate(()=>({
    filter:document.querySelector('#ownerAttentionPanel')?.dataset.ownerFocusFilter||'',
    historyDisplay:getComputedStyle(document.querySelector('.owner-outcome-history')).display,
    outcomeDisplay:getComputedStyle(document.querySelector('.owner-outcome-row')).display
  }));
  assert.equal(outcomeState.filter,'outcomes');
  assert.equal(outcomeState.historyDisplay,'none','pending-outcomes view must hide already-recorded outcome history');
  assert.notEqual(outcomeState.outcomeDisplay,'none');

  await page.evaluate(()=>{
    const row=document.createElement('article');
    row.className='owner-outcome-row';
    row.textContent='New unresolved outcome';
    document.querySelector('.owner-outcome-loop').insertBefore(row,document.querySelector('.owner-outcome-history'));
  });
  await page.waitForFunction(()=>document.querySelector('[data-focus-metric="outcomes"] .owner-focus-value')?.textContent==='2');

  await page.locator('.owner-focus-ask').click();
  const prompt=await page.locator('#thebeAiDock textarea').inputValue();
  assert.match(prompt,/outcome recorded|outcome/i,'Ask Thebe should be primed with the active governed queue context');

  const calculatorAfter=await page.locator('#propertyCalculator').evaluate(node=>({style:node.getAttribute('style'),rect:{left:node.getBoundingClientRect().left,top:node.getBoundingClientRect().top,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height}}));
  assert.deepEqual(calculatorAfter,calculatorBefore,'V296 must leave the approved Property calculator geometry untouched');
  assert.deepEqual(errors,[],'V296 must not throw browser errors');
  console.log('V296_OWNER_FOCUS_V2_BROWSER_PASS: exact queue filtering, scoped live counts, contextual Thebe handoff and Calculator geometry are preserved');
}finally{await browser.close()}
