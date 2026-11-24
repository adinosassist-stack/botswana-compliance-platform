import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";

execFileSync(process.execPath,["--check","public/js/thebe-live-voice.js"]);
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,"playwright"):"playwright-core");
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,"/usr/bin/google-chrome","/usr/bin/chromium"]
  .filter(Boolean).find(p=>fs.existsSync(p));
const browser=await chromium.launch({headless:true,executablePath,args:["--no-sandbox","--disable-dev-shm-usage"]});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];
page.on("pageerror",error=>errors.push(error.message));

try{
  await page.route("http://thebe-find.test/**",route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==="/")return route.fulfill({contentType:"text/html",body:`<!doctype html><html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0">
      <section id="marketingGate" style="display:none" hidden></section>
      <section id="appShell"><h1 id="pageTitle">Workspace</h1>
      <select id="companySelect" aria-label="Company"><option value="company-A">A</option><option value="company-B">B</option></select>
      <div class="view active" id="dashboard"></div></section></body></html>`});
    const local="public"+pathname;
    return fs.existsSync(local)?route.fulfill({path:local}):route.fulfill({status:404,body:""});
  });
  await page.addInitScript(()=>{
    window.currentWorkspaceRole=()=> "owner";
    window.currentUser={id:"owner-A",tenantId:"tenant-A",role:"owner",firstName:"Tester"};
    window.advisorCalls=0;
    window.apiJson=async url=>url==="/api/ai/advisor"
      ?{answer:"Grounded test answer "+(++window.advisorCalls),references:[]}
      :{sessionCreationAllowed:false};
    window.ThebeLiveVoice={status:()=>({state:"idle"}),start:async()=>{},stop:()=>{},setMuted:()=>{}};
  });
  await page.goto("http://thebe-find.test/");
  await page.addStyleTag({path:path.resolve("public/assets/thebe-ai-dock.css")});
  // Match the authenticated web workspace runtime's top-level lexical 'let',
  // which is not a window property. The Dock must prefer it to stale fallback.
  await page.addScriptTag({content:'let currentUser={id:"owner-A",tenantId:"tenant-A",role:"owner",firstName:"Real shell"};'});
  await page.addScriptTag({path:path.resolve("public/js/thebe-live-voice.js")});
  await page.evaluate(()=>window.ThebeAiDock.open());
  const dock=page.locator("#thebeAiDock");
  await dock.waitFor({state:"visible"});
  await page.evaluate(async()=>{
    await window.ThebeAiDock.ask("First question","ask");
    await window.ThebeAiDock.ask("Second question","ask");
  });
  assert.equal(await page.locator(".thebe-aura-turn").count(),3,"Previous user and assistant turns are retained");
  const toggle=dock.locator(".thebe-ai-find-toggle");
  const panel=dock.locator("#thebeAiFindPanel");
  const field=panel.locator(".thebe-ai-find-input");
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-expanded"),"true");
  await field.fill("First question");
  assert.equal(await panel.locator(".thebe-ai-find-status").innerText(),"1 matching messages");
  await field.press("Enter");
  assert.equal(await panel.locator(".thebe-ai-find-status").innerText(),"1 of 1 matching messages");
  assert.equal(await field.evaluate(el=>document.activeElement===el),true,"Keyboard navigation preserves search field focus");
  assert.equal(await dock.locator(".thebe-ai-find-current").count(),1,"The current matching message is visibly identified");
  assert.equal(await dock.locator(".thebe-ai-find").evaluate(el=>getComputedStyle(el).position),"sticky","Search controls stay in the scroll viewport");
  await field.fill("Grounded test answer 2");
  await panel.locator(".thebe-ai-find-next").click();
  assert.equal(await panel.locator(".thebe-ai-find-next").evaluate(el=>document.activeElement===el),true,"Button navigation preserves control focus");
  assert.equal(await dock.locator(".thebe-ai-find-current").count(),1,"Only one matching message is highlighted");
  assert.equal(await dock.locator("#thebeAiDockResponse.thebe-ai-find-current").count(),1,"The current answer can be the active search result");
  await field.fill("no-such-message");
  assert.equal(await dock.locator(".thebe-ai-find-current").count(),0,"A changed query clears the old match highlight");
  assert.equal(await panel.locator(".thebe-ai-find-status").innerText(),"No matching messages");
  assert(await panel.locator(".thebe-ai-find-next").isDisabled(),"Empty results have no navigation");
  await field.press("Escape");
  assert.equal(await panel.isHidden(),true);
  assert.equal(await toggle.getAttribute("aria-expanded"),"false");
  assert.equal(await dock.locator(".thebe-ai-find-current").count(),0,"Closing search removes temporary highlights");

  const composer=dock.locator("#thebeAiDockInput");
  const edit=dock.locator(".thebe-aura-turn[data-role=user] .thebe-aura-edit-prompt").first();
  assert.equal(await edit.innerText(),"","Prompt edit uses an icon instead of a large text button");
  assert.equal(await edit.getAttribute("aria-label"),"Edit and resend this message as a new prompt");
  assert.equal(await edit.locator('svg[aria-hidden="true"]').count(),1,"Decorative icon is hidden from assistive technology");
  const editGeometry=await edit.boundingBox();
  assert(editGeometry&&editGeometry.width>=43.5&&editGeometry.height>=43.5,"Prompt edit preserves a 44px touch target");
  assert(editGeometry.width<=60,"Prompt edit remains compact");
  await composer.fill("Unsent draft");
  await edit.click();
  assert.equal(await composer.inputValue(),"Unsent draft","Prompt reuse never overwrites an unsent draft");
  await composer.fill("");
  await edit.click();
  assert.equal(await composer.inputValue(),"First question","Prompt reuse restores the selected message");
  assert.equal(await composer.evaluate(el=>document.activeElement===el),true,"Prompt reuse focuses the composer");
  assert.equal(await page.evaluate(()=>window.advisorCalls),2,"Editing never submits a paid request");
  await composer.fill("");
  // Search is local UI-only. There is no assistant request or persisted search text.
  assert.equal(await page.evaluate(()=>window.advisorCalls),2);
  assert.equal(await page.evaluate(()=>
    [...Object.values(localStorage),...Object.values(sessionStorage)].some(x=>String(x).includes("no-such-message"))),false);

  await dock.locator(".thebe-ai-expand").evaluate(button=>button.click());
  await toggle.click();
  await field.fill("Second question");
  for(const width of [320,375,414,430,768]){
    await page.setViewportSize({width,height:844});
    await page.evaluate(()=>window.ThebeAiDock.open());
    await dock.waitFor({state:"visible"});
    const g=await panel.evaluate(el=>{
      const rect=el.getBoundingClientRect();
      const input=el.querySelector("input").getBoundingClientRect();
      return {left:rect.left,right:rect.right,fieldLeft:input.left,fieldRight:input.right,viewport:innerWidth};
    });
    const controls=await panel.locator(".thebe-ai-find-input-row button").evaluateAll(els=>els.map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
    assert(controls.every(c=>c.width>=43.5&&c.height>=43.5),"Search navigation touch targets are at least 44px");
    assert(g.left>=-1&&g.right<=g.viewport+1&&g.fieldLeft>=-1&&g.fieldRight<=g.viewport+1,
      "Find remains within web viewport: "+JSON.stringify(g));
  }
  const regenerate=dock.locator(".thebe-ai-regenerate");
  await composer.fill("Keep this draft");
  await regenerate.evaluate(button=>button.click());
  assert.equal(await page.evaluate(()=>window.advisorCalls),2,"Regeneration cannot overwrite a draft or start a request");
  assert.equal(await composer.inputValue(),"Keep this draft");
  await composer.fill("");
  await regenerate.evaluate(button=>button.click());
  await page.waitForFunction(()=>window.advisorCalls===3&&document.querySelector("#thebeAiDockResponse")?.textContent.includes("Grounded test answer 3"));
  assert.equal(await dock.locator(".thebe-aura-turn[data-role=assistant]").count(),2,"Regeneration retains the previous answer");
  assert.equal(await page.evaluate(()=>window.advisorCalls),3,"One explicit regeneration makes one advisor request");
  await page.evaluate(()=>window.ThebeAiDock.clear());
  assert.equal(await panel.isHidden(),true,"Clearing a chat closes search");
  assert.equal(await field.inputValue(),"","Clearing a chat removes the search phrase");
  await toggle.click();
  assert(await field.isVisible(),"Search remains available after clearing");
  await field.fill("not in empty chat");
  assert.equal(await panel.locator(".thebe-ai-find-status").innerText(),"No matching messages");
  await field.press("Escape");
  assert.equal(await page.locator(".thebe-aura-turn").count(),0,"Clearing a chat removes in-memory turns");

  // Company switching in one signed-in SPA must never carry private chat or
  // a draft into the newly selected business. No real tenant is requested.
  await page.evaluate(async()=>window.ThebeAiDock.ask("Company A confidential quotation","ask"));
  assert.equal(await page.locator(".thebe-aura-turn").count(),1);
  await dock.locator("#thebeAiDockInput").fill("Sensitive unsent company A draft");
  await page.selectOption("#companySelect","company-B");
  assert.equal(await page.locator(".thebe-aura-turn").count(),0,"Switching business clears the previous company's chat");
  assert.equal(await dock.locator("#thebeAiDockInput").inputValue(),"","Switching business clears an unsent draft");
  assert.equal(await panel.isHidden(),true,"Switching business resets in-session search");
  assert.equal(await dock.locator(".thebe-ai-find-current").count(),0);
  assert.equal(await dock.locator("#thebeAiDockResponse").evaluate(x=>x.textContent.includes("Grounded test answer 4")),false,
    "Switching business removes the previous business answer");
  await page.evaluate(async()=>window.ThebeAiDock.ask("Company B private test","ask"));
  assert.equal(await page.locator(".thebe-aura-turn").count(),1);
  await page.evaluate(()=>{
    // Deliberately leave window.currentUser as owner-A: the real runtime's
    // mutable global lexical binding is authoritative for this UI boundary.
    currentUser={id:"owner-B",tenantId:"tenant-B",role:"owner",firstName:"Second"};
    window.dispatchEvent(new Event("thebe:workspace-ready"));
  });
  assert.equal(await page.locator(".thebe-aura-turn").count(),0,"Changing authenticated global lexical identity resets the same-tab chat");
  assert.equal(await dock.locator("#thebeAiDockInput").inputValue(),"");
  // Research remains hidden until both server-rendered gates are present.
  const research=dock.locator(".thebe-ai-web-search");
  assert.equal(await research.isHidden(),true);
  await page.evaluate(()=>{
    window.researchRequests=[];
    const original=window.apiJson;
    window.apiJson=async (url,options)=>{
      if(url!=="/api/ai/general")return original(url,options);
      window.researchRequests.push(JSON.parse(options.body));
      return {ok:true,answer:"Synthetic cited research",researchPerformed:true,verification:"search_snippets_only",citations:[{url:"https://example.org/source",title:"Example source"},{url:"javascript:alert(1)",title:"Unsafe scheme"},{url:"https://localhost/private",title:"Private host"}]};
    };
    for(const name of ["thebe-general-ai-enabled","thebe-general-ai-research-enabled"]){
      const meta=document.createElement("meta");meta.name=name;meta.content="true";document.head.append(meta);
    }
    window.dispatchEvent(new Event("thebe:workspace-ready"));
  });
  await page.evaluate(()=>window.ThebeAiDock.open());
  assert.equal(await research.isVisible(),true);
  await composer.fill("Public Botswana news");
  await research.click();
  await page.waitForFunction(()=>document.querySelector(".thebe-ai-web-sources")?.textContent.includes("Example source"));
  assert.deepEqual(await page.evaluate(()=>window.researchRequests),[{question:"Search the web: Public Botswana news"}]);
  const links=dock.locator(".thebe-ai-web-sources a");
  assert.equal(await links.count(),1);
  assert.equal(await links.getAttribute("href"),"https://example.org/source");
  assert.equal(await links.getAttribute("rel"),"noopener noreferrer");
  await page.evaluate(()=>{
    document.querySelector('meta[name="thebe-general-ai-research-enabled"]').content="false";
    window.dispatchEvent(new Event("thebe:workspace-ready"));
  });
  assert.equal(await research.isHidden(),true);
  await composer.fill("Draft must survive disabled research");
  await research.evaluate(button=>button.click());
  assert.equal(await composer.inputValue(),"Draft must survive disabled research");
  assert.equal(await page.evaluate(()=>window.researchRequests.length),1);
  assert.deepEqual(errors,[],"The web Dock creates no browser page errors");
  console.log("THEBE_WEB_FIND_BROWSER_PASS: local search, current response, navigation, reset, responsive geometry");
}finally{await browser.close()}
