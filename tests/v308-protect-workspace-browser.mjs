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
    <section id="protecthub" class="view active simplified-hub protect-hub"><div class="hub-hero"><div><b>Protect</b><h2>Keep the business protected.</h2></div><button class="btn">Ask Thebe</button></div><div class="outcome-status-strip">Legacy status</div><div class="outcome-grid">Legacy cards</div><div class="notice">Legacy disclaimer</div></section>
    <button data-view="obligations">Obligations nav</button><button data-view="statutorycalendar">Calendar nav</button><button data-view="evidencehub">Evidence nav</button>
    <section id="propertyintelligence"><div class="property-calculator-v224" id="protectedPropertyCalculator">Protected calculator</div></section>
    <aside id="thebeAiDock" class="thebe-ai-dock"></aside><button id="thebeAiDockPill" hidden>AI</button>
  </body></html>`);
  await page.evaluate(()=>{
    Date.now=()=>new Date('2026-10-07T12:00:00+02:00').getTime();
    globalThis.__protectFetchMode='ready';
    globalThis.__protectExplainPrompt='';
    globalThis.__protectView='';
    globalThis.openThebeFromHome=prompt=>{globalThis.__protectExplainPrompt=String(prompt||'')};
    globalThis.showView=view=>{globalThis.__protectView=String(view||'')};
    const payloads={
      '/api/obligations':{items:[
        {id:'o1',title:'Submit annual return',area:'Corporate',status:'open',due_at:'2026-10-05'},
        {id:'o2',title:'Renew trade evidence',authority:'Council',status:'blocked',due_at:'2026-10-20'},
        {id:'o3',title:'Review PAYE evidence',area:'Tax',status:'review'},
        {id:'o4',title:'Old completed action',area:'Tax',status:'completed',due_at:'2026-09-01'}
      ]},
      '/api/statutory-calendar':{obligations:[
        {id:'s1',title:'PAYE filing',rule_title:'PAYE monthly filing',status:'open',due_at:'2026-10-12'},
        {id:'s2',title:'VAT return',rule_title:'VAT return',status:'open',due_at:'2026-10-01'}
      ],schedules:[{id:'sc1',rule_title:'Trade annual fee',config_status:'needs_input'}]},
      '/api/next-actions':{items:[
        {id:'n1',source:'regulatory',title:'Compliance: Annual return proof',proofMissing:2,proofTotal:3},
        {id:'n2',source:'operations',title:'Operational task',proofMissing:5,proofTotal:5}
      ]}
    };
    globalThis.BW={api:{createClient:()=>({request:async(path,options)=>{
      if(options?.method!=='GET')throw new Error('unexpected Protect write');
      if(globalThis.__protectFetchMode==='fail')throw new TypeError('simulated protection outage');
      if(globalThis.__protectFetchMode==='partial'&&path==='/api/next-actions')throw new TypeError('simulated proof queue outage');
      if(!payloads[path])throw new Error('unexpected Protect path '+path);
      return payloads[path];
    }})}};
  });
  const before=await page.evaluate(()=>({property:document.getElementById('protectedPropertyCalculator').getBoundingClientRect().toJSON(),dock:document.getElementById('thebeAiDock').getBoundingClientRect().toJSON()}));
  await page.addScriptTag({path:'public/js/protect-workspace-v308.js'});
  await page.waitForFunction(()=>document.getElementById('protecthub')?.dataset.protectV308State==='ready',null,{timeout:5000});
  const state=await page.evaluate(()=>{
    const root=document.getElementById('protecthub'),mount=document.getElementById('protectWorkspaceV308');
    const buttons=[...mount.querySelectorAll('button')].map(button=>button.getBoundingClientRect().height);
    const legacy=[...root.children].filter(node=>node.classList.contains('outcome-grid')||node.classList.contains('outcome-status-strip')||node.classList.contains('notice')).map(node=>getComputedStyle(node).display);
    return {release:globalThis.ThebeProtectWorkspaceV308?.release,lanes:mount.querySelectorAll('.protect-v308-lane').length,text:mount.innerText,scrollWidth:document.documentElement.scrollWidth,innerWidth,buttons,legacy,property:document.getElementById('protectedPropertyCalculator').getBoundingClientRect().toJSON(),dock:document.getElementById('thebeAiDock').getBoundingClientRect().toJSON()};
  });
  assert.equal(state.release,'20261007-protect-workspace-v308');
  assert.equal(state.lanes,3,'three deterministic protection work lanes');
  assert.match(state.text,/Fix action gaps/);assert.match(state.text,/Meet filing dates/);assert.match(state.text,/Close proof gaps/);
  assert.match(state.text,/3\s+Open total|Open total\s+3/);assert.match(state.text,/1d late/);assert.match(state.text,/2\s+Missing proof|Missing proof\s+2/);
  assert.match(state.text,/Decision boundary:/);assert.match(state.text,/does not declare legal compliance/);
  assert.equal(state.scrollWidth<=state.innerWidth+1,true,`390px Protect layout overflowed: scroll=${state.scrollWidth} viewport=${state.innerWidth}`);
  assert(state.buttons.every(height=>height>=43.5),`touch target below 44px: ${state.buttons.join(',')}`);
  assert(state.legacy.every(display=>display==='none'),'legacy Protect cards must be visually superseded only after V308 mounts');
  assert.deepEqual({width:Math.round(state.property.width),height:Math.round(state.property.height)},{width:Math.round(before.property.width),height:Math.round(before.property.height)},'Property calculator geometry changed');
  assert.deepEqual({width:Math.round(state.dock.width),height:Math.round(state.dock.height)},{width:Math.round(before.dock.width),height:Math.round(before.dock.height)},'dock geometry changed');

  await page.getByRole('button',{name:'Explain with Thebe'}).tap();
  const explain=await page.evaluate(()=>globalThis.__protectExplainPrompt);
  assert.match(explain,/confirmed obligations/i);assert.match(explain,/Do not claim legal compliance/i);
  await page.getByRole('button',{name:'Open compliance actions'}).tap();
  assert.equal(await page.evaluate(()=>globalThis.__protectView),'obligations');

  await page.evaluate(async()=>{globalThis.__protectFetchMode='partial';await globalThis.ThebeProtectWorkspaceV308.refresh()});
  await page.waitForFunction(()=>document.getElementById('protecthub')?.dataset.protectV308State==='degraded',null,{timeout:5000});
  const degraded=await page.locator('#protectWorkspaceV308').innerText();
  assert.match(degraded,/2 of 3 protection sources confirmed/);assert.match(degraded,/Proof gaps\s+Unknown|Unknown\s+Proof action queue unavailable/);assert.match(degraded,/Proof queue unavailable/);

  await page.evaluate(async()=>{globalThis.__protectFetchMode='fail';await globalThis.ThebeProtectWorkspaceV308.refresh()});
  await page.waitForFunction(()=>document.getElementById('protecthub')?.dataset.protectV308State==='unavailable',null,{timeout:5000});
  const unavailable=await page.locator('#protectWorkspaceV308').innerText();
  assert.match(unavailable,/Protect workspace unavailable/);assert.match(unavailable,/Do not interpret this state as compliant, current or complete/);
  assert.deepEqual(errors,[],'V308 browser page errors');
  console.log('PASS: V308 Protect phone layout, deterministic compliance lanes, AI secondary action, partial/full fail-closed state, Property and dock geometry');
}finally{await browser.close()}
