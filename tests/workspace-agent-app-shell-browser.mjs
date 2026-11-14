import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,"playwright")
  : "playwright-core");
const executablePath = [
  process.env.CHROMIUM_EXECUTABLE_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].filter(Boolean).find(candidate=>fs.existsSync(candidate));

const publicJs = path.resolve("public/js");
const allowedModules = new Set([
  "workspace-agent-app-shell.js", "workspace-agent-event-adapter.js",
  "workspace-agent-shell-bridge.js", "workspace-agent-dock-lifecycle.js",
  "workspace-agent-authenticated-controller.js", "workspace-agent-task-fetch.js",
  "workspace-agent-task-renderer.js", "workspace-agent-task-view.js"
]);
const state = { role:"owner", tenantId:"tenant-A", userId:"user-1", requests:[], writes:[] };
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <div id="marketingGate" class="hidden" hidden></div>
  <div id="authGate" class="hidden" hidden></div>
  <main id="appShell" style="display:block;visibility:visible">
    <section id="dashboard" class="view active">Dashboard</section>
    <section id="moneyhub" class="view">Money</section>
    <section id="payments" class="view">Payments</section>
    <select id="companySelect"><option value="co-A">Company A</option><option value="co-B">Company B</option></select>
  </main>
  <section id="thebeAiDock" data-surface="workspace"></section>
  <script>window.__THEBE_WORKSPACE_READY__=true;</script>
  <script type="module" src="/js/workspace-agent-app-shell.js"></script>
</body></html>`;
const server = http.createServer((req,res)=>{
  const url = new URL(req.url, "http://127.0.0.1");
  state.requests.push({ method:req.method, path:url.pathname, query:url.search });
  const send=(status,payload)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(payload));};
  if (url.pathname==="/app/") {res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});res.end(html);return;}
  if (url.pathname.startsWith("/js/")) {
    const name=url.pathname.slice(4);
    if (!allowedModules.has(name)) {res.writeHead(404);res.end();return;}
    res.writeHead(200,{"content-type":"application/javascript; charset=utf-8","cache-control":"no-store"});
    res.end(fs.readFileSync(path.join(publicJs,name)));return;
  }
  if (req.method!=="GET") {
    state.writes.push(url.pathname);
    return send(405,{error:"method_not_allowed"});
  }
  if (url.pathname==="/api/auth/me") {
    return state.role==="unauthenticated" ? send(401,{error:"unauthenticated"}) :
      send(200,{user:{id:state.userId,role:state.role},csrfToken:"synthetic-test-csrf"});
  }
  if (url.pathname==="/api/agentic/workspace-identity") {
    return ["owner","manager"].includes(state.role) ?
      send(200,{ok:true,tenantId:state.tenantId,userId:state.userId}) :
      send(403,{error:"forbidden"});
  }
  if (url.pathname==="/api/agentic/workspace-tasks") {
    if (!["owner","manager"].includes(state.role)) return send(403,{error:"forbidden"});
    const workspace=url.searchParams.get("workspace")||"owner";
    return send(200,{ok:true,tasks:[{
      id:"task-"+workspace, title:"Review verified "+workspace+" items",
      tenantId:state.tenantId,userId:state.userId,workspace,
      state:"queued",approvalRequired:true,executionAllowed:false,
      externalSideEffects:false,authority:"recommendation_only"
    }]});
  }
  return send(404,{error:"not_found"});
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const browser=await chromium.launch({headless:true,executablePath,args:["--no-sandbox","--disable-dev-shm-usage"]});
try {
  const page=await browser.newPage();
  await page.goto(origin+"/app/");
  await page.locator('[data-thebe-agent-task-panel="1"] li').waitFor({timeout:10000});
  assert.match(await page.locator('[data-thebe-agent-task-panel="1"]').innerText(),/verified owner items/);
  assert.ok(state.requests.some(request=>request.path==="/api/auth/me"));
  assert.ok(state.requests.some(request=>request.path==="/api/agentic/workspace-identity"));

  // A real view class change MUST clear old scope even without a custom event.
  await page.evaluate(()=>{
    document.getElementById("dashboard").classList.remove("active");
    document.getElementById("moneyhub").classList.add("active");
  });
  await page.getByText("Review verified finance items").waitFor();
  assert.ok(!await page.getByText("Review verified owner items").count(),"old workspace tasks must be removed");

  // Company switch requires a fresh same-origin session and scoped task fetch.
  const authBefore=state.requests.filter(request=>request.path==="/api/auth/me").length;
  state.tenantId="tenant-B";
  await page.locator("#companySelect").selectOption("co-B");
  await page.getByText("Review verified finance items").waitFor();
  await page.waitForFunction(()=>document.getElementById("thebeAiDock")?.dataset?.agentTaskScope?.includes("tenant-B"));
  assert.ok(state.requests.filter(request=>request.path==="/api/auth/me").length>authBefore);

  // Unmapped DOM-only view cannot retain earlier tenant-scoped advice.
  await page.evaluate(()=>{
    document.getElementById("moneyhub").classList.remove("active");
    document.getElementById("payments").classList.add("active");
  });
  await page.waitForFunction(()=>!document.querySelector('[data-thebe-agent-task-panel="1"]'));
  assert.equal(await page.locator('[data-thebe-agent-task-panel="1"]').count(),0);

  // Session expiry and rejected role must fail closed.
  state.role="reviewer";
  await page.evaluate(()=>{
    document.getElementById("payments").classList.remove("active");
    document.getElementById("dashboard").classList.add("active");
    window.dispatchEvent(new CustomEvent("thebe:workspace-view-change",{detail:{id:"dashboard"}}));
  });
  await page.waitForFunction(()=>!document.getElementById("thebeAiDock")?.dataset.agentTaskScope);
  assert.equal(await page.locator('[data-thebe-agent-task-panel="1"]').count(),0);
  state.role="unauthenticated";
  await page.locator("#companySelect").selectOption("co-A");
  await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-thebe-agent-task-panel="1"]').count(),0);

  // Returning to an authenticated owner does not automatically authorize via a spoofed role event:
  // a valid server recheck and opaque identity API are mandatory.
  state.role="owner";
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent("thebe:workspace-agent-shell-state",{
    detail:{reason:"ready",authenticated:true,role:"owner",view:"dashboard"}
  })));
  await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-thebe-agent-task-panel="1"]').count(),0);
  await page.evaluate(()=>window.__THEBE_AGENT_APP_SHELL__?.refresh());
  await page.getByText("Review verified owner items").waitFor();

  // Dock surface changes are not custom events: hidden advice must disappear
  // and later reappear only after a fresh authenticated session request.
  const authBeforeDock=state.requests.filter(request=>request.path==="/api/auth/me").length;
  await page.evaluate(()=>document.getElementById("thebeAiDock").dataset.surface="hidden");
  await page.waitForFunction(()=>!document.querySelector('[data-thebe-agent-task-panel="1"]'));
  assert.equal(await page.locator('[data-thebe-agent-task-panel="1"]').count(),0);
  await page.evaluate(()=>document.getElementById("thebeAiDock").dataset.surface="workspace");
  await page.getByText("Review verified owner items").waitFor();
  assert.ok(state.requests.filter(request=>request.path==="/api/auth/me").length>authBeforeDock);

  // Hiding the shell must clear sensitive task scope immediately.
  await page.evaluate(()=>document.getElementById("appShell").style.display="none");
  await page.waitForFunction(()=>!document.querySelector('[data-thebe-agent-task-panel="1"]'));
  assert.equal(await page.locator('[data-thebe-agent-task-panel="1"]').count(),0);
  assert.deepEqual(state.writes,[],"advisory agent must not issue POST/PUT/PATCH/DELETE requests");
  console.log("PASS: Chromium DOM-only Agent navigation, dock surface invalidation, tenant isolation, role expiry and no writes");
  await page.close();
} finally {
  await browser.close();
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}
