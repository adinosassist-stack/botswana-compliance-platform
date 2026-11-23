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
      <div class="view active" id="dashboard"></div></section></body></html>`});
    const local="public"+pathname;
    return fs.existsSync(local)?route.fulfill({path:local}):route.fulfill({status:404,body:""});
  });
  await page.addInitScript(()=>{
    window.currentWorkspaceRole=()=> "owner";
    window.currentUser={firstName:"Tester"};
    window.advisorCalls=0;
    window.apiJson=async url=>url==="/api/ai/advisor"
      ?{answer:"Grounded test answer "+(++window.advisorCalls),references:[]}
      :{sessionCreationAllowed:false};
    window.ThebeLiveVoice={status:()=>({state:"idle"}),start:async()=>{},stop:()=>{},setMuted:()=>{}};
  });
  await page.goto("http://thebe-find.test/");
  await page.addStyleTag({path:path.resolve("public/assets/thebe-ai-dock.css")});
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
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.role),"user");
  await field.fill("Grounded test answer 2");
  await panel.locator(".thebe-ai-find-next").click();
  assert.equal(await page.evaluate(()=>document.activeElement?.id),"thebeAiDockResponse","Current response is searchable");
  await field.fill("no-such-message");
  assert.equal(await panel.locator(".thebe-ai-find-status").innerText(),"No matching messages");
  assert(await panel.locator(".thebe-ai-find-next").isDisabled(),"Empty results have no navigation");
  await field.press("Escape");
  assert.equal(await panel.isHidden(),true);
  assert.equal(await toggle.getAttribute("aria-expanded"),"false");

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
    assert(g.left>=-1&&g.right<=g.viewport+1&&g.fieldLeft>=-1&&g.fieldRight<=g.viewport+1,
      "Find remains within web viewport: "+JSON.stringify(g));
  }
  await page.evaluate(()=>window.ThebeAiDock.clear());
  assert.equal(await panel.isHidden(),true,"Clearing a chat closes search");
  assert.equal(await field.inputValue(),"","Clearing a chat removes the search phrase");
  assert.equal(await page.locator(".thebe-aura-turn").count(),0,"Clearing a chat removes in-memory turns");
  assert.deepEqual(errors,[],"The web Dock creates no browser page errors");
  console.log("THEBE_WEB_FIND_BROWSER_PASS: local search, current response, navigation, reset, responsive geometry");
}finally{await browser.close()}
