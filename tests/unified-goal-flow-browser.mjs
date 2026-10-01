import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,"playwright"):"playwright-core");
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,"/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium"].filter(Boolean).find(p=>fs.existsSync(p));
const browser=await chromium.launch({headless:true,executablePath,args:["--no-sandbox","--disable-dev-shm-usage"]});
try{
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 const errors=[];page.on("pageerror",error=>errors.push(error.message));
 await page.route("http://goal.test/**",route=>route.fulfill({contentType:"text/html",body:'<!doctype html><html><body><section id="marketingGate" style="display:none"></section><section id="appShell"><h1 id="pageTitle">Home</h1><main class="view active" id="dashboard"></main></section></body></html>'}));
 await page.goto("http://goal.test/");
 await page.addStyleTag({path:"public/assets/thebe-ai-dock.css"});
 await page.evaluate(()=>{
  window.role="owner";window.currentWorkspaceRole=()=>window.role;
  window.showView=id=>{window.openedView=id;return true};
  window.calls=[];
  window.plan={run:{id:"run-a",goal:"Protect cash",summary:"Review collections before acting."},proposals:[{id:"p-a",run_id:"run-a",title:"<img src=x onerror=alert(1)>",reason:"Recorded overdue balance",status:"pending",sourceRefs:["receivables"]}]};
  window.apiJson=async(path,options={})=>{
   if(path==="/api/agentic/plan"){
    window.calls.push({path,body:JSON.parse(options.body)});
    if(window.failPlan)throw new Error("Source unavailable");
    if(window.deferPlan)return new Promise(resolve=>window.resolvePlan=resolve);
    return window.plan;
   }
   if(path==="/api/agentic/runs"){window.calls.push({path});return {items:[window.plan.run],proposals:window.plan.proposals}}
   return {sessionCreationAllowed:false};
  };
 });
 await page.addScriptTag({path:"public/js/owner-command-centre.js"});
 await page.addScriptTag({path:"public/js/thebe-live-voice.js"});
 await page.waitForSelector("#thebeAiDock");
 await page.evaluate(()=>window.ThebeAiDock.ask("Reduce overdue collections","goal_plan"));
 assert.equal(await page.evaluate(()=>window.calls[0].body.goal),"Reduce overdue collections");
 assert.equal(await page.locator(".thebe-ai-plan-artifact").getAttribute("data-run-id"),"run-a");
 await page.locator(".thebe-ai-plan-artifact summary").click();
 assert.match(await page.locator(".thebe-ai-plan-artifact").innerText(),/Evidence · receivables/);
 assert.equal(await page.locator(".thebe-ai-plan-artifact img").count(),0,"proposal content must render as text");
 assert.equal((await page.evaluate(()=>window.ThebeAiDock.state())).mascotState,"approval");
 await page.getByRole("button",{name:"Review plan",exact:true}).click();
 assert.equal(await page.evaluate(()=>window.openedView),"dashboard");
 assert.equal(await page.evaluate(()=>window.calls.some(call=>/approve|execute|permit/.test(call.path))),false,"review handoff cannot execute or approve");
 await page.evaluate(()=>window.ThebeAiDock.ask("Show my latest saved plan","resume_plan"));
 assert.equal((await page.evaluate(()=>window.ThebeAiDock.state())).lastGoal,"Protect cash");
 assert.match(await page.locator(".thebe-ai-plan-artifact").innerText(),/Recorded overdue balance/);
 await page.evaluate(()=>{window.failPlan=true;return window.ThebeAiDock.ask("Check cash","goal_plan")});
 assert.match(await page.locator("#thebeAiDockResponse").innerText(),/Source unavailable/);
 assert.equal(await page.locator(".thebe-ai-plan-artifact").count(),0,"failed runs cannot show an old plan as current");
 await page.evaluate(()=>{window.failPlan=false;window.deferPlan=true;void window.ThebeAiDock.ask("Check cash","goal_plan")});
 await page.waitForFunction(()=>typeof window.resolvePlan==="function");
 await page.evaluate(()=>{window.ThebeAiDock.clear();window.resolvePlan(window.plan)});
 await page.waitForFunction(()=>window.ThebeAiDock.state().textBusy===false);
 assert.equal(await page.locator(".thebe-ai-plan-artifact").count(),0,"cleared runs cannot repaint stale results");
 await page.evaluate(()=>{window.deferPlan=false;window.role="employee";return window.ThebeAiDock.ask("Check cash","goal_plan")});
 assert.match(await page.locator("#thebeAiDockResponse").innerText(),/owners and managers/);
 await page.evaluate(()=>{window.role="manager";return window.ThebeAiDock.ask("Check cash","goal_plan")});
 assert.equal(await page.getByRole("button",{name:"Keep watching",exact:true}).isHidden(),true);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent("thebe:verified-task-result",{detail:{verified:false,task:{id:"task-a"},receiptId:"receipt-a"}})));
 assert.notEqual((await page.evaluate(()=>window.ThebeAiDock.state())).lastAdvisorTrust,"verified");
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent("thebe:verified-task-result",{detail:{verified:true,task:{id:"task-a",title:"Internal follow-up"},receiptId:"receipt-a"}})));
 assert.equal((await page.evaluate(()=>window.ThebeAiDock.state())).lastAdvisorTrust,"verified");
 assert.match(await page.locator("#thebeAiDockResponse").innerText(),/Receipt · receipt-a/);
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{window.ThebeAiDock.open();window.ThebeAiDock.setMode("goal_plan")});
 const width=await page.locator(".thebe-ai-mode-rail").evaluate(node=>({scroll:node.scrollWidth,width:node.clientWidth}));
 assert.ok(width.scroll<=width.width+1,"Plan mode controls must fit a mobile dock");
 assert.deepEqual(errors,[]);
 console.log("UNIFIED_GOAL_FLOW_BROWSER_PASS");
}finally{await browser.close()}
