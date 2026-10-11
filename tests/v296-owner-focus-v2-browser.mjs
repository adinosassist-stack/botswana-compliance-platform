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
      <div class="owner-panel-head"><span class="badge">999</span></div>
      <div class="owner-review-inbox"><div class="section-eyebrow">Owner approval inbox</div><article class="owner-review-row"><b>Approve supplier plan</b><button type="button">Record approval</button></article></div>
      <div class="owner-outcome-loop"><div class="section-eyebrow">Measured outcomes</div><article class="owner-outcome-row"><b>Pricing change</b><div class="owner-outcome-actions"><button type="button">resolved</button></div></article><div class="owner-outcome-history"><div>Previous outcome</div></div></div>
      <div class="owner-attention-list"><article class="owner-attention-item">Cash gap</article><article class="owner-attention-item">Late licence</article><article class="owner-attention-item">Sales follow-up</article></div>
    </section>
  </section>
  <div id="propertyCalculator" style="position:absolute;left:10px;top:20px;width:100px;height:50px">Calculator</div>
</main>
<button id="thebeAiDockPill" type="button">Open Thebe</button>
<div id="thebeAiDock" data-surface="workspace"><textarea aria-label="Ask Thebe"></textarea></div>
<script src="/fixture.js"></script>
<script src="/js/owner-focus-strip-v296.js"></script>
</body></html>`;

const bootstrap=`
window.currentWorkspaceRole=()=>"owner";
window.fixtureApiCalls=[];
window.fixtureRefreshCount=0;
window.fixtureCanonical={
  daily:{
    date:"2026-10-11",
    generatedAt:"2026-10-11T08:00:00Z",
    status:{openWork:999,urgent:999,overdue:999},
    topActions:[{id:"misleading-client-field"}],
    ownerAttention:{
      version:"2026-10-11.v1",
      state:"ready",
      generatedAt:"2026-10-11T08:00:00Z",
      businessDate:"2026-10-11",
      market:{code:"BW",country:"Botswana",jurisdiction:"Botswana",currency:"BWP",timeZone:"Africa/Gaborone"},
      counts:{action:3,approvals:1,outcomes:1,recommendations:1,total:5,urgent:1,overdue:0},
      items:[
        {key:"work:a1",sourceType:"work",sourceId:"a1",category:"action",title:"Cash gap",sourceRefs:["work:a1"],authoritative:true},
        {key:"agentic_proposal:p1",sourceType:"agentic_proposal",sourceId:"p1",category:"approval",title:"Approve supplier plan",sourceRefs:["agentic_proposal:p1"],authoritative:true},
        {key:"agentic_proposal_outcome:p2",sourceType:"agentic_proposal_outcome",sourceId:"p2",category:"outcome",title:"Pricing change",sourceRefs:["agentic_proposal:p2"],authoritative:true},
        {key:"business_priority:r1",sourceType:"business_priority",sourceId:"r1",category:"recommendation",title:"Recommendation",sourceRefs:[],authoritative:false}
      ],
      sourceAvailability:{
        dailyBrief:{available:true,required:true},
        approvals:{available:true,required:true},
        outcomes:{available:true,required:true},
        businessContext:{available:true,required:false}
      },
      provenance:{authority:"server_canonical_owner_attention"}
    }
  }
};
window.fixtureReadyAttention=structuredClone(window.fixtureCanonical.daily.ownerAttention);
window.apiJson=async url=>{
  window.fixtureApiCalls.push(url);
  if(url==="/api/daily-brief")return structuredClone(window.fixtureCanonical.daily);
  throw new Error("unexpected fixture API "+url);
};
window.ThebeOwnerCommandCentre={refresh:async()=>{window.fixtureRefreshCount+=1;return true}};
`;

const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://localhost/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/')return route.fulfill({contentType:'text/html',body:fixture});
    if(pathname==='/fixture.js')return route.fulfill({contentType:'application/javascript',body:bootstrap});
    if(pathname==='/js/owner-focus-strip-v296.js')return route.fulfill({contentType:'application/javascript',path:'public/js/owner-focus-strip-v296.js'});
    return route.fulfill({status:404,body:''});
  });
  await page.goto('http://localhost/');
  await page.waitForFunction(()=>document.documentElement.dataset.ownerFocusStrip==='20261011-owner-focus-canonical-v327');
  await page.waitForSelector('#ownerFocusStrip');
  await page.waitForFunction(()=>{
    const metrics=Object.fromEntries([...document.querySelectorAll('#ownerFocusStrip [data-focus-metric]')].map(node=>[node.dataset.focusMetric,node.querySelector('.owner-focus-value')?.textContent]));
    return metrics.action==='3'&&metrics.approvals==='1'&&metrics.outcomes==='1';
  });

  const readMetrics=()=>page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#ownerFocusStrip [data-focus-metric]')].map(node=>[node.dataset.focusMetric,node.querySelector('.owner-focus-value')?.textContent])));
  const values=await readMetrics();
  assert.deepEqual(values,{action:'3',approvals:'1',outcomes:'1'},'Owner Focus metrics must reflect the exact canonical Owner Attention payload, not contradictory DOM or sibling Daily Brief fields');
  assert.equal(await page.locator('#ownerAttentionPanel .badge').innerText(),'999','fixture must retain a contradictory DOM count to prove it is not authoritative');
  assert.deepEqual(await page.evaluate(()=>[...new Set(window.fixtureApiCalls)]),['/api/daily-brief'],'Owner Focus must consume one canonical backend payload rather than rebuilding truth from multiple APIs');

  await page.setViewportSize({width:1440,height:900});
  await page.waitForTimeout(80);
  assert.deepEqual(await readMetrics(),values,'desktop and mobile layouts must display the exact same canonical metrics');
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(80);
  assert.deepEqual(await readMetrics(),values,'returning to mobile must not alter canonical metrics');

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
  assert.match(approvalState.activeTag,/owner-review-row/,'approval filter should focus the first rendered review row');

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

  await page.locator('.owner-focus-ask').click();
  const prompt=await page.locator('#thebeAiDock textarea').inputValue();
  assert.match(prompt,/outcome recorded|outcome/i,'Ask Thebe should be primed with the active governed queue context');

  // DOM tampering must not alter canonical business counts.
  await page.evaluate(()=>{
    const row=document.createElement('article');
    row.className='owner-outcome-row';
    row.textContent='DOM-only unresolved outcome';
    document.querySelector('.owner-outcome-loop').insertBefore(row,document.querySelector('.owner-outcome-history'));
  });
  await page.waitForTimeout(250);
  assert.equal(await page.locator('[data-focus-metric="outcomes"] .owner-focus-value').innerText(),'1','adding a DOM row must not change the canonical pending-outcome count');

  // Only a changed canonical backend payload may update a canonical metric.
  await page.evaluate(async()=>{
    const attention=window.fixtureCanonical.daily.ownerAttention;
    attention.counts.outcomes=2;
    attention.counts.total=6;
    attention.items.push({key:'agentic_proposal_outcome:p3',sourceType:'agentic_proposal_outcome',sourceId:'p3',category:'outcome',title:'Second pending outcome',sourceRefs:['agentic_proposal:p3'],authoritative:true});
    await window.ThebeOwnerFocusStrip.refreshCanonical({force:true});
  });
  await page.waitForFunction(()=>document.querySelector('[data-focus-metric="outcomes"] .owner-focus-value')?.textContent==='2');

  // Rendering may be incomplete while backend truth remains known: navigation disables, count stays canonical.
  await page.evaluate(()=>document.querySelector('.owner-review-row')?.remove());
  await page.locator('[data-focus-metric="approvals"]').click();
  await page.waitForFunction(()=>document.querySelector('.owner-focus-next')?.disabled===true);
  assert.equal(await page.locator('[data-focus-metric="approvals"] .owner-focus-value').innerText(),'1','removing the rendered approval row must not erase the canonical approval count');
  const emptyApprovalNext=await page.locator('.owner-focus-next').evaluate(node=>({disabled:node.disabled,label:node.getAttribute('aria-label')}));
  assert.equal(emptyApprovalNext.disabled,true,'Review next must disable when the active filtered queue has no rendered item');
  assert.match(emptyApprovalNext.label||'',/No approvals to review/i,'disabled Review next must explain the active empty rendered queue');

  await page.locator('[data-focus-metric="action"]').click();
  await page.waitForFunction(()=>document.querySelector('.owner-focus-next')?.disabled===false);
  await page.locator('.owner-focus-next').click();
  assert.match(await page.evaluate(()=>document.activeElement?.className||''),/owner-attention-item/,'Review next must focus the first rendered item in the active non-empty queue');

  // A malformed/missing canonical projection must fail closed even when sibling Daily Brief fields look healthy.
  await page.evaluate(async()=>{
    delete window.fixtureCanonical.daily.ownerAttention;
    window.fixtureCanonical.daily.status.openWork=0;
    await window.ThebeOwnerFocusStrip.refreshCanonical({force:true});
  });
  await page.waitForFunction(()=>document.querySelector('#ownerFocusStrip')?.dataset.state==='unavailable');
  assert.equal(await page.locator('[data-focus-metric="action"] .owner-focus-value').innerText(),'—');
  assert.equal(await page.locator('[data-focus-metric="approvals"] .owner-focus-value').innerText(),'—');
  assert.equal(await page.locator('[data-focus-metric="outcomes"] .owner-focus-value').innerText(),'—');

  // Retry must restore only from a new canonical payload and must not widen into approval/execution endpoints.
  await page.evaluate(()=>{
    const restored=structuredClone(window.fixtureReadyAttention);
    restored.counts={...restored.counts,action:4,approvals:2,outcomes:1,total:7};
    restored.generatedAt='2026-10-11T09:00:00Z';
    window.fixtureCanonical.daily.ownerAttention=restored;
  });
  await page.locator('.owner-focus-retry').click();
  await page.waitForFunction(()=>document.querySelector('#ownerFocusStrip')?.dataset.state==='ready');
  assert.deepEqual(await readMetrics(),{action:'4',approvals:'2',outcomes:'1'},'retry must restore metrics from the refreshed canonical payload');
  assert.ok(await page.evaluate(()=>window.fixtureRefreshCount>=1),'retry must invoke the existing Owner Command Centre refresh path');
  assert.deepEqual(await page.evaluate(()=>[...new Set(window.fixtureApiCalls)]),['/api/daily-brief'],'retry must not call approval, outcome or execution APIs directly');

  const calculatorAfter=await page.locator('#propertyCalculator').evaluate(node=>({style:node.getAttribute('style'),rect:{left:node.getBoundingClientRect().left,top:node.getBoundingClientRect().top,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height}}));
  assert.deepEqual(calculatorAfter,calculatorBefore,'Owner Focus upgrades must leave the approved Property calculator geometry untouched');
  assert.deepEqual(errors,[],'Owner Focus canonical upgrade must not throw browser errors');
  console.log('OWNER_FOCUS_CANONICAL_BROWSER_PASS: exact canonical payload resists DOM and sibling-field tampering, remains viewport-stable, and recovers without widening authority');
}finally{await browser.close()}