import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"..");
const pub=path.join(root,"public");
const html=fs.readFileSync(path.join(pub,"index.html"),"utf8");
const domHtml=html.replace(/<script\b[\s\S]*?<\/script>/gi,"");
const eventDelegation=fs.readFileSync(path.join(pub,"js/event-delegation.js"),"utf8");
const worker=fs.readFileSync(path.join(root,"cloudflare/src/worker.js"),"utf8");
const lazyManifest=JSON.parse(fs.readFileSync(path.join(pub,"assets/workspace-view-fragments-20261001a.json"),"utf8"));
const lazyHtml=Object.values(lazyManifest.views||{}).join("\n");

const ids=[...domHtml.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const dup=[...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];
assert.deepEqual(dup,[],"duplicate ids: "+dup.join(", "));

const views=[...domHtml.matchAll(/<button[^>]+data-view="([^"]+)"/g)].map(m=>m[1]);
const idSet=new Set(ids);
const missingViews=views.filter(v=>!idSet.has(v));
assert.deepEqual(missingViews,[],"missing navigation targets: "+missingViews.join(", "));

const funcs=new Set([...html.matchAll(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]));
const directHandlers=[...domHtml.matchAll(/\bon(?:click|change|focus|input|submit)="\s*([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]).filter(x=>x!=="if");
const browserBuiltins=new Set(["alert","confirm","prompt"]);
const missingHandlers=[...new Set(directHandlers.filter(f=>!funcs.has(f)&&!browserBuiltins.has(f)))];
assert.deepEqual(missingHandlers,[],"missing inline handler functions: "+missingHandlers.join(", "));

const allowedBlock=eventDelegation.match(/const ALLOWED_ACTIONS=new Set\(\[([\s\S]*?)\]\);/)?.[1]||"";
const allowedActions=new Set([...allowedBlock.matchAll(/['"]([A-Za-z_$][\w$]*)['"]/g)].map(m=>m[1]));
assert.ok(allowedActions.size>100,"delegated action allowlist unexpectedly small");

function delegatedActions(expression){
  const out=[];
  for(let statement of String(expression||"").split(";").map(x=>x.trim()).filter(Boolean)){
    if(statement.startsWith("if(event.target===this)"))statement=statement.slice("if(event.target===this)".length).trim();
    let match=statement.match(/^setTimeout\(\s*([A-Za-z_$][\w$]*)\s*,/);
    if(match){out.push(match[1]);continue}
    if(/^window\.print\(\)$/.test(statement)||/^window\.location\.assign\(/.test(statement)||/^navigator\.clipboard/.test(statement))continue;
    match=statement.match(/^([A-Za-z_$][\w$]*)\s*\(/);
    assert.ok(match,"unrecognized delegated action expression: "+statement);
    out.push(match[1]);
  }
  return out;
}

const delegatedExpressions=[...domHtml.matchAll(/\bdata-bw-on(?:click|change|focus|input|submit|keydown|keyup)="([^"]+)"/g)].map(m=>m[1]);
const lazyDelegatedExpressions=[...lazyHtml.matchAll(/\bdata-bw-on(?:click|change|focus|input|submit|keydown|keyup)="([^"]+)"/g)].map(m=>m[1]);
const delegatedUsed=new Set(delegatedExpressions.flatMap(delegatedActions));
const lazyDelegatedUsed=new Set(lazyDelegatedExpressions.flatMap(delegatedActions));
const delegatedNotAllowed=[...delegatedUsed].filter(name=>!allowedActions.has(name));
const lazyDelegatedNotAllowed=[...lazyDelegatedUsed].filter(name=>!allowedActions.has(name));
assert.deepEqual(delegatedNotAllowed,[],"delegated controls reference blocked actions: "+delegatedNotAllowed.join(", "));
assert.deepEqual(lazyDelegatedNotAllowed,[],"lazy delegated controls reference blocked actions: "+lazyDelegatedNotAllowed.join(", "));
const delegatedMissingFunctions=[...delegatedUsed].filter(name=>!funcs.has(name));
assert.deepEqual(delegatedMissingFunctions,[],"delegated controls reference missing functions: "+delegatedMissingFunctions.join(", "));

const protectedWorkflowExpression="startWorkflow(document.getElementById('protectedWorkflowType').value)";
const corporateChangeExpression="runCorpChange(document.getElementById('corporateChangeType').value)";
assert.ok(lazyDelegatedExpressions.includes(protectedWorkflowExpression),"protected HR workflow control must remain covered by lazy-view functionality tests");
assert.ok(lazyDelegatedExpressions.includes(corporateChangeExpression),"corporate-change control must remain covered by lazy-view functionality tests");

class DelegatedElement{
  constructor(attrs={}){this.attrs=attrs;this.value="";this.checked=false}
  getAttribute(name){return this.attrs[name]??null}
}
const delegatedValues=new Map([
  ["protectedWorkflowType",{value:"Misconduct"}],
  ["corporateChangeType",{value:"director"}]
]);
const delegatedDocument={
  addEventListener(){},
  getElementById(id){return delegatedValues.get(id)??null}
};
const delegatedCalls=[];
const delegatedWindow={
  document:delegatedDocument,
  Element:DelegatedElement,
  location:{href:"https://workspace.test/",origin:"https://workspace.test"},
  setTimeout,
  BW:{},
  startWorkflow(value){delegatedCalls.push(["workflow",value])},
  runCorpChange(value){delegatedCalls.push(["corp",value])}
};
vm.runInNewContext(eventDelegation,{window:delegatedWindow,console,URL,setTimeout});
assert.equal(delegatedWindow.BW.events.isAllowedExpression(protectedWorkflowExpression),true,"protected workflow must be accepted by the secure delegated-event parser");
assert.equal(delegatedWindow.BW.events.isAllowedExpression(corporateChangeExpression),true,"corporate change must be accepted by the secure delegated-event parser");
delegatedWindow.BW.events.runExpression(protectedWorkflowExpression,new DelegatedElement(),{target:null});
delegatedWindow.BW.events.runExpression(corporateChangeExpression,new DelegatedElement(),{target:null});
assert.deepEqual(delegatedCalls,[["workflow","Misconduct"],["corp","director"]],"lazy controls must pass only the selected DOM value into their allowlisted actions");
assert.equal(delegatedWindow.BW.events.isAllowedExpression("startWorkflow(document.getElementById('protectedWorkflowType').value.trim())"),false,"delegated DOM values must reject chained method calls");
assert.equal(delegatedWindow.BW.events.isAllowedExpression("startWorkflow(document.querySelector('#protectedWorkflowType').value)"),false,"delegated DOM values must reject arbitrary selectors");

function regexEscape(value){return String(value).replace(/[.*+?^$()|[\]\\{}]/g,"\\$&")}
function buttonHasBinding(attrs){
  if(/\bdata-bw-onclick=/.test(attrs)||/\bdata-view=/.test(attrs)||/\btype="submit"/.test(attrs)||/\bdisabled\b/.test(attrs))return true;
  const id=attrs.match(/\bid="([^"]+)"/)?.[1];
  if(!id)return false;
  const safe=regexEscape(id);
  return new RegExp("closest\\?\\.\\([\"']#"+safe+"[\"']\\)").test(html)
    ||new RegExp("getElementById\\([\"']"+safe+"[\"']\\)[\\s\\S]{0,220}(?:addEventListener|onclick\\s*=)").test(html);
}

const buttons=[...domHtml.matchAll(/<button\b([^>]*)>/gi)].map(m=>m[1]);
const inertButtons=buttons.filter(attrs=>!buttonHasBinding(attrs));
assert.deepEqual(inertButtons,[],"inert buttons found: "+inertButtons.slice(0,8).join(" | "));

for(const action of ["createOpsReporterLink","copyOpsReporterLink","shareOpsReporterLink","revokeOpsReporterAccess","submitDailyReporterForm","openEmployeeReportingAccess","createEmployeeReportingLinkFromCard","copyEmployeeReportingLink","showFreshEmployeeReportingLink","loadOpsPerformanceLearning"]){
  assert.ok(allowedActions.has(action),"employee reporting action must be delegated: "+action);
  assert.ok(funcs.has(action),"employee reporting action implementation missing: "+action);
}
assert.ok(worker.includes("const link=")&&worker.includes("#report=${encodeURIComponent(token)}")&&!worker.includes("?report=${encodeURIComponent(token)}"),"employee reporting bearer token must remain fragment-scoped and never enter the query string");
assert.ok(worker.includes('url.pathname.startsWith("/js/")&&url.pathname.endsWith(".js")'),"all first-party JS runtimes must be served no-store");
assert.ok(worker.includes('20260921-workspace-actions-v1'),"workspace action runtime release marker missing");
assert.ok(worker.includes('versioned=html.replace(/src="')&&worker.includes('CLIENT_RUNTIME_RELEASE'),"root HTML must version every first-party JS runtime");

for(const rel of [...domHtml.matchAll(/(?:src|href)="(assets\/[^"?#]+)"/g)].map(m=>m[1]))assert.ok(fs.existsSync(path.join(pub,rel)),"missing local asset: "+rel);
assert.match(html,/async function runScan\(\)/,"compliance scan button must have an implementation");

assert.ok(html.includes('class="thebe-market-photo"')&&html.includes('src="/assets/gaborone-entrepreneurs-v67.webp"')&&html.includes('width="1536" height="1024"')&&html.includes('class="marketingvisual market-photo-visual"')&&html.includes('overflow:visible!important;background:transparent!important;box-shadow:none!important'),"marketing hero must use the restored Botswana business photo without mascot artwork");
assert.doesNotMatch(html,/thebe-market-mascot|thebe-mascot-original\.png/,"marketing and workspace shell must remain mascot-free");
assert.match(html,/data-bw-onclick="openEmployeeReportingAccess\('[^']+'\)"[^>]*>Reporting link<\/button>/,"employee rows must expose a dedicated reporting-link control");
assert.match(html,/data-bw-onclick="openEmployeeReportingAccess\('\$\{safeId\(e\.id\)\}'\)"/,"employee name/row must bind directly to employee reporting access");
assert.match(html,/aria-label="Open reporting access for \$\{escapeHtml\(e\.full_name\)\}"/,"employee reporting row control must remain explicitly labelled");
assert.match(html,/timeoutMs:90000,retries:2,candidateTimeoutMs:30000/,"reporting analytics must use the hardened bounded timeout/retry budget");
assert.match(html,/reportingAnalyticsMemory=new Map\(\)/,"reporting analytics must retain a bounded in-memory last-good response for timeout recovery");
assert.match(html,/Date\.now\(\)-cached\.at<15\*60\*1000/,"reporting analytics timeout fallback must expire within 15 minutes");
assert.match(worker,/includeInactive=url\.searchParams\.get\("includeInactive"\)==="1"/,"employee directory API must default to active staff with explicit inactive opt-in");
assert.match(worker,/includeInactive\?"":"AND lower\(trim\(coalesce\(e\.status,''\)\)='active' "/,"removed employees must be excluded from the default employee directory response");
console.log("PASS UI functionality: "+buttons.length+" buttons, "+delegatedExpressions.length+" resident delegated controls, "+lazyDelegatedExpressions.length+" lazy delegated controls, "+new Set([...delegatedUsed,...lazyDelegatedUsed]).size+" delegated actions, "+views.length+" nav targets");
