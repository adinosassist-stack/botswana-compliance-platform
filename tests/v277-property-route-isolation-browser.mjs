import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const guard=fs.readFileSync('public/js/workspace-property-route-isolation-v277.js','utf8');
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].filter(Boolean).find(candidate=>fs.existsSync(candidate));
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});

try{
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.setContent(`<!doctype html><html><head><style>
    .view{display:none}
    .view.active{display:block}
    #propertyintelligence,#peopleops{min-height:180px}
  </style></head><body>
    <main id="mainContent">
      <section class="view active" id="propertyintelligence"><button id="propertyAction">Property action</button></section>
      <section class="view" id="peopleops"><button id="peopleAction">People action</button></section>
    </main>
  </body></html>`);
  await page.addScriptTag({content:guard});
  await page.waitForFunction(()=>window.ThebeWorkspacePropertyRouteIsolation?.release==='20261004-property-route-isolation-v277');

  const initial=await page.evaluate(()=>({
    display:getComputedStyle(document.getElementById('propertyintelligence')).display,
    state:window.ThebeWorkspacePropertyRouteIsolation.state()
  }));
  assert.notEqual(initial.display,'none','Property must stay visible on the Property route');
  assert.equal(initial.state.active,true,'guard must recognise active Property');
  assert.equal(initial.state.isolated,false,'active Property must not be isolated');

  await page.evaluate(()=>{
    const property=document.getElementById('propertyintelligence');
    const people=document.getElementById('peopleops');
    const staleRepair=()=>{
      property.removeAttribute('aria-hidden');
      property.removeAttribute('inert');
      property.style.setProperty('display','block','important');
      property.style.setProperty('visibility','visible','important');
      property.style.setProperty('opacity','1','important');
    };
    window.__v277StaleRepair=staleRepair;
    property.classList.remove('active');
    people.classList.add('active');
    window.dispatchEvent(new CustomEvent('thebe:workspace-view-change',{detail:{id:'peopleops'}}));
    staleRepair();
    setTimeout(staleRepair,20);
    setTimeout(staleRepair,180);
    setTimeout(staleRepair,700);
  });
  await page.waitForTimeout(860);

  const peopleState=await page.evaluate(()=>{
    const property=document.getElementById('propertyintelligence');
    const people=document.getElementById('peopleops');
    return {
      propertyDisplay:getComputedStyle(property).display,
      propertyInlineDisplay:property.style.getPropertyValue('display'),
      propertyInlinePriority:property.style.getPropertyPriority('display'),
      propertyAriaHidden:property.getAttribute('aria-hidden'),
      propertyInert:property.hasAttribute('inert'),
      peopleDisplay:getComputedStyle(people).display,
      state:window.ThebeWorkspacePropertyRouteIsolation.state()
    };
  });
  assert.equal(peopleState.propertyDisplay,'none','Property must remain hidden after the 700ms stale repair');
  assert.equal(peopleState.propertyInlineDisplay,'none','guard must override stale inline display:block');
  assert.equal(peopleState.propertyInlinePriority,'important','guard must defeat the existing !important repair');
  assert.equal(peopleState.propertyAriaHidden,'true','inactive Property must be aria-hidden');
  assert.equal(peopleState.propertyInert,true,'inactive Property must be inert');
  assert.notEqual(peopleState.peopleDisplay,'none','People must remain the visible workspace');
  assert.equal(peopleState.state.active,false,'guard state must report Property inactive');
  assert.equal(peopleState.state.isolated,true,'guard state must report Property isolated');

  await page.evaluate(()=>{
    const property=document.getElementById('propertyintelligence');
    const people=document.getElementById('peopleops');
    people.classList.remove('active');
    property.classList.add('active');
    window.__v277StaleRepair();
    window.dispatchEvent(new CustomEvent('thebe:workspace-view-change',{detail:{id:'propertyintelligence'}}));
  });
  await page.waitForTimeout(50);

  const returned=await page.evaluate(()=>{
    const property=document.getElementById('propertyintelligence');
    return {
      display:getComputedStyle(property).display,
      ariaHidden:property.getAttribute('aria-hidden'),
      inert:property.hasAttribute('inert'),
      state:window.ThebeWorkspacePropertyRouteIsolation.state()
    };
  });
  assert.notEqual(returned.display,'none','Property must be restored when navigating back to Property');
  assert.equal(returned.ariaHidden,null,'active Property must not remain aria-hidden');
  assert.equal(returned.inert,false,'active Property must not remain inert');
  assert.equal(returned.state.active,true,'guard must report Property active after return');
  assert.equal(returned.state.isolated,false,'active Property must release V277 isolation');

  console.log('V277 Property route-isolation browser regression passed');
}finally{
  await browser.close();
}
