import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const runtime=fs.readFileSync("public/js/workspace-runtime-20261001b.js","utf8");
const canonical=fs.readFileSync("public/index.html","utf8");
const report=fs.readFileSync("public/js/daily-report-money-v331.js","utf8");
const start="async function yieldFirstWorkspacePaint(){";
const end="async function loadServerState(){";
for(const [name,source] of [["canonical",canonical],["runtime",runtime]]){
  const i=source.indexOf(start),j=source.indexOf(end,i);
  assert(i>=0&&j>i,`${name} must have a paint yielding helper`);
  const body=source.slice(i,j);
  assert.match(body,/requestAnimationFrame\(\(\)=>setTimeout\(resolve,0\)\)/);
  const production=source.slice(source.indexOf("const st=consumeInitialWorkspaceState()"),source.indexOf("\n}",source.indexOf("const st=consumeInitialWorkspaceState()")));
  assert.match(production,/applyRoleUi\(\);hideAuth\(\);const landing=/);
  assert.match(production,/await yieldFirstWorkspacePaint\(\);renderAll\(\);logEvent\("APP_OPENED"/);
  assert(production.indexOf("hideAuth();")<production.indexOf("await yieldFirstWorkspacePaint();"));
  assert(production.indexOf("await yieldFirstWorkspacePaint();")<production.indexOf("renderAll();"));
}
const slice=runtime.slice(runtime.indexOf(start),runtime.indexOf(end,runtime.indexOf(start)));
const frames=[],tasks=[];
const context=vm.createContext({document:{visibilityState:"visible"},requestAnimationFrame:cb=>frames.push(cb),setTimeout:cb=>tasks.push(cb)});
vm.runInContext(slice,context);
let resolved=false;
const result=context.yieldFirstWorkspacePaint().then(()=>{resolved=true});
await Promise.resolve();assert.equal(resolved,false);
assert.equal(frames.length,1);
frames[0]();await Promise.resolve();assert.equal(resolved,false);
assert.equal(tasks.length,1);
tasks[0]();await result;assert.equal(resolved,true);
context.document.visibilityState="hidden";
await context.yieldFirstWorkspacePaint();assert.equal(frames.length,1,"hidden tabs must not wait for animation frames");
assert.match(report,/if\(!view\?\.classList\.contains\("active"\)\)return;/,"hidden Daily Reports must not issue eager reads");
assert.match(report,/if\(event\.detail\?\.id==="dailyreports"\)mount\(\)/,"Daily Reports must hydrate on open");
assert.match(report,/ThebeReportMoney=Object\.freeze\(\{release:RELEASE,refresh:/,"explicit refresh must remain available");
console.log("PASS: authenticated startup yields a paint, preserves role gating, and defers hidden Daily Reports reads.");
