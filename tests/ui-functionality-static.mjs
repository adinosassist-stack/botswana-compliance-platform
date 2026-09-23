import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"..");
const pub=path.join(root,"public");
const html=fs.readFileSync(path.join(pub,"index.html"),"utf8");
const domHtml=html.replace(/<script\b[\s\S]*?<\/script>/gi,"");
const eventDelegation=fs.readFileSync(path.join(pub,"js/event-delegation.js"),"utf8");
const worker=fs.readFileSync(path.join(root,"cloudflare/src/worker.js"),"utf8");

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
const delegatedUsed=new Set(delegatedExpressions.flatMap(delegatedActions));
const delegatedNotAllowed=[...delegatedUsed].filter(name=>!allowedActions.has(name));
assert.deepEqual(delegatedNotAllowed,[],"delegated controls reference blocked actions: "+delegatedNotAllowed.join(", "));
const delegatedMissingFunctions=[...delegatedUsed].filter(name=>!funcs.has(name));
assert.deepEqual(delegatedMissingFunctions,[],"delegated controls reference missing functions: "+delegatedMissingFunctions.join(", "));

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

for(const action of ["createOpsReporterLink","copyOpsReporterLink","shareOpsReporterLink","revokeOpsReporterAccess","submitDailyReporterForm","openEmployeeReportingAccess","createEmployeeReportingLinkFromCard","copyEmployeeReportingLink","loadOpsPerformanceLearning"]){
  assert.ok(allowedActions.has(action),"employee reporting action must be delegated: "+action);
  assert.ok(funcs.has(action),"employee reporting action implementation missing: "+action);
}
assert.ok(worker.includes("const link=")&&worker.includes("/#report=")&&worker.includes("encodeURIComponent(token)"),"employee reporting bearer link must remain fragment-scoped");
assert.ok(worker.includes('url.pathname.startsWith("/js/")&&url.pathname.endsWith(".js")'),"all first-party JS runtimes must be served no-store");
assert.ok(worker.includes('20260921-workspace-actions-v1'),"workspace action runtime release marker missing");
assert.ok(worker.includes('versioned=html.replace(/src="')&&worker.includes('CLIENT_RUNTIME_RELEASE'),"root HTML must version every first-party JS runtime");

for(const rel of [...domHtml.matchAll(/(?:src|href)="(assets\/[^"?#]+)"/g)].map(m=>m[1]))assert.ok(fs.existsSync(path.join(pub,rel)),"missing local asset: "+rel);
assert.match(html,/async function runScan\(\)/,"compliance scan button must have an implementation");

assert.ok(html.includes('src="/assets/gaborone-entrepreneurs-v67.webp"')&&html.includes('height:auto!important')&&html.includes('object-fit:contain!important')&&html.includes('position:relative!important;left:auto!important;right:auto!important;bottom:auto!important'),"marketing hero must preserve the original 1536x1024 image framing without cover-cropping or covering most of the photo");
console.log("PASS UI functionality: "+buttons.length+" buttons, "+delegatedExpressions.length+" delegated controls, "+delegatedUsed.size+" delegated actions, "+views.length+" nav targets");
