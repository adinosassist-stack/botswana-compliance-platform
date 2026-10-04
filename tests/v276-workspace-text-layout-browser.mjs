import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const guard=fs.readFileSync('public/js/workspace-text-layout-guard-v276.js','utf8');
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].filter(Boolean).find(p=>fs.existsSync(p));
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
const longCopy='Long workspace explanation that must remain fully visible inside its information container instead of being silently clipped after the first line.';
const longToken='PROPERTY_REFERENCE_WITH_A_VERY_LONG_UNBROKEN_IDENTIFIER_2026_10_04_FOR_WRAP_TESTING';

const fixture=`<!doctype html><html><head><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;font-family:Arial,sans-serif}#mainContent{width:100%;padding:14px}
.test-card,.card,.owner-today-card,.property-summary-card,.property-service-card,.people-status-chip,.market-v257-stats>div,.proof-summary-card{border:1px solid #d9e2ef;border-radius:12px;padding:10px;background:white}
.outcome-grid,.owner-input-grid,.property-summary-grid,.property-service-grid,.people-status-strip,.people-outcome-grid,.market-v257-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.owner-command-head,.property-workspace-toolbar,.property-service-head,.property-lease-head{display:flex;justify-content:space-between;gap:8px}
.outcome-card-status,.people-outcome-status,.owner-today-detail,.home-signal-card .muted.small,#proofNextDetail,.proof-summary-card>span:not(.proof-summary-label):not(.proof-summary-link){display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden;line-height:20px;max-width:100%}
.outcome-status-chip,.people-status-chip{overflow:hidden}
.btn{display:inline-block;padding:8px 10px;white-space:nowrap;max-width:170px;overflow:hidden}
input{width:100%;min-width:320px}
#thebeLiveVoiceDock{white-space:nowrap;width:68px;position:fixed;right:12px;bottom:12px}
</style></head><body><main id="mainContent">
<section class="simplified-hub"><div class="outcome-grid"><div class="outcome-card test-card"><b>Operations</b><div id="outcomeCopy" class="outcome-card-status">${longCopy}</div></div><div class="outcome-status-chip test-card"><b>4</b><span>${longCopy}</span></div></div></section>
<section id="dashboard"><div class="owner-today-card"><div class="owner-today-label">Priority</div><div id="todayCopy" class="owner-today-detail">${longCopy}</div></div><div class="home-signal-card test-card"><div id="signalCopy" class="muted small">${longCopy}</div></div></section>
<section class="owner-command-centre"><div class="owner-command-head"><h3>${longToken}</h3><button id="longButton" class="btn">Very long action label that must wrap instead of disappearing</button></div><div class="owner-input-grid"><label class="card">${longCopy}<input value="${longToken}"></label><div class="card">${longToken}</div></div></section>
<section class="property-workspace"><div class="property-workspace-toolbar"><h3>${longToken}</h3><button class="btn">Long property workspace action</button></div><div class="property-summary-grid"><div class="property-summary-card"><div class="property-summary-label">Reference</div><div id="propertyValue" class="property-summary-value">${longToken}</div></div><div class="property-summary-card"><div class="property-description">${longCopy}</div></div></div><div class="property-service-grid"><div class="property-service-card"><div class="property-service-head"><strong>${longToken}</strong><span class="property-service-meta">${longCopy}</span></div></div></div></section>
<section id="peopleops"><div class="people-status-strip"><button class="people-status-chip"><b>75%</b><span>${longCopy}</span></button><button class="people-status-chip"><b>5</b><span>${longToken}</span></button></div><div class="people-outcome-grid"><div class="people-outcome-card"><div id="peopleCopy" class="people-outcome-status">${longCopy}</div></div></div></section>
<section id="servicesmarketplace"><div class="market-v257-stats"><div><span>${longToken}</span><strong>24</strong></div><div><span>${longCopy}</span><strong>8</strong></div></div></section>
<section id="evidencehub"><div class="proof-summary-card"><span id="proofNextDetail">${longCopy}</span></div></section>
<div id="thebeLiveVoiceDock">Voice</div>
</main></body></html>`;

function visibleWithinContainer(result,label){
  assert(result.width<=result.parentWidth+1,`${label} width must fit container`);
  assert(result.right<=result.parentRight+1,`${label} right edge must stay inside container`);
  assert(result.left>=result.parentLeft-1,`${label} left edge must stay inside container`);
}

try{
  for(const width of [390,768,1280]){
    const page=await browser.newPage({viewport:{width,height:1000}});
    await page.setContent(fixture);
    await page.addScriptTag({content:guard});
    await page.waitForFunction(()=>document.documentElement.dataset.workspaceTextLayout?.includes('v276'));

    const pageOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    assert.equal(pageOverflow,false,`no horizontal page overflow at ${width}`);

    for(const selector of ['#outcomeCopy','#todayCopy','#signalCopy','#peopleCopy','#proofNextDetail']){
      const state=await page.locator(selector).evaluate(el=>({
        overflow:getComputedStyle(el).overflow,
        whiteSpace:getComputedStyle(el).whiteSpace,
        lineClamp:getComputedStyle(el).webkitLineClamp,
        height:el.getBoundingClientRect().height,
        lineHeight:parseFloat(getComputedStyle(el).lineHeight)
      }));
      assert.equal(state.overflow,'visible',`${selector} overflow visible at ${width}`);
      assert.equal(state.whiteSpace,'normal',`${selector} wraps at ${width}`);
      assert(state.lineClamp==='none'||state.lineClamp==='unset'||state.lineClamp==='auto',`${selector} line clamp removed at ${width}: ${state.lineClamp}`);
      assert(state.height>state.lineHeight*1.5,`${selector} must show multiple lines at ${width}`);
    }

    for(const selector of ['#propertyValue','.owner-command-head h3','.market-v257-stats span']){
      const result=await page.locator(selector).first().evaluate(el=>{
        const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();
        return {width:r.width,right:r.right,left:r.left,parentWidth:p.width,parentRight:p.right,parentLeft:p.left,wrap:getComputedStyle(el).overflowWrap};
      });
      visibleWithinContainer(result,selector);
      assert.equal(result.wrap,'anywhere',`${selector} uses safe wrapping at ${width}`);
    }

    const button=await page.locator('#longButton').evaluate(el=>({whiteSpace:getComputedStyle(el).whiteSpace,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight}));
    assert.equal(button.whiteSpace,'normal',`button label wraps at ${width}`);
    assert(button.scrollWidth<=button.clientWidth+1,`button text is not horizontally clipped at ${width}`);
    assert(button.scrollHeight<=button.clientHeight+1,`button text is not vertically clipped at ${width}`);

    const dock=await page.locator('#thebeLiveVoiceDock').evaluate(el=>({width:getComputedStyle(el).width,position:getComputedStyle(el).position,whiteSpace:getComputedStyle(el).whiteSpace}));
    assert.equal(dock.width,'68px',`dock width unchanged at ${width}`);
    assert.equal(dock.position,'fixed',`dock position unchanged at ${width}`);
    assert.equal(dock.whiteSpace,'nowrap',`dock text behavior untouched at ${width}`);

    if(width<=620){
      for(const selector of ['.owner-input-grid','.property-summary-grid','.people-status-strip','.market-v257-stats']){
        const xs=await page.locator(`${selector}>*`).evaluateAll(nodes=>nodes.slice(0,2).map(n=>Math.round(n.getBoundingClientRect().x)));
        if(xs.length===2)assert.equal(xs[0],xs[1],`${selector} stacks to one column at ${width}`);
      }
    }
    await page.close();
  }
  console.log('V276_WORKSPACE_TEXT_LAYOUT_BROWSER_PASS: long copy stays visible and aligned at 390/768/1280 without changing dock geometry');
}finally{
  await browser.close();
}
