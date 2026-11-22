import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const runtime=fs.readFileSync(new URL("../public/js/workspace-runtime-20261001b.js",import.meta.url),"utf8");
const inline=html.match(/<script id="thebe-workspace-runtime-inline">([\s\S]*?)<\/script>/)?.[1]?.replace(/^\n/,"").replace(/\s*$/,"")+"\n";
assert.equal(inline,runtime,"the two workspace runtime copies must remain identical");
const first=runtime.indexOf("async function runFirstProtectionCheck(){");
const last=runtime.indexOf("\nasync function saveWizard(){",first);
assert.ok(first>0&&last>first,"first protection check function must be extractable");
const code=runtime.slice(first,last);

function fixture({role="owner",failRule=false,failSave=false,failActions=false,failCalendar=false}={}){
 const state={profile:{firstProtectionCheckStatus:"pending",firstProtectionCheckAt:null}};
 const events=[],persisted=[],requests=[];
 const elements=new Map();
 const element=id=>{
  if(!elements.has(id))elements.set(id,{textContent:"",safeHTML:"",className:"",classList:{add:()=>{}}});
  return elements.get(id);
 };
 const context={
  state,STANDALONE_PREVIEW:false,document:{getElementById:element},
  currentWorkspaceRole:()=>role,
  apiJson:async url=>{
   requests.push(url);
   if(url==="/api/regulatory/rules")return {items:[{id:"rule-1",status:"published"}]};
   if(url.endsWith("/evaluate")){if(failRule)throw Error("Rule unavailable");return {};}
   if(url==="/api/statutory-calendar/recalculate"){if(failCalendar)throw Error("Calendar unavailable");return {};}
   if(url==="/api/next-actions"){if(failActions)throw Error("Actions unavailable");return {items:[{id:"action-1",title:"Review records"}]};}
   throw Error("Unexpected route: "+url);
  },
  updateActiveCompany:fn=>fn(state),
  persistWorkspaceState:async()=>{
   events.push("save-attempt");
   if(failSave)throw Error("State save unavailable");
   persisted.push(structuredClone(state.profile));
   events.push("save-ack");
   return {version:2};
  },
  renderFirstValueResult:items=>events.push("success:"+items.length),
  renderFirstValueFailure:message=>events.push("retry:"+message),
  renderUnifiedNextActions:async()=>{},
  renderHomeDecisionSignals:async()=>{},
  renderWorkHub:async()=>{},
  renderOnboardingBanner:async()=>{},
 };
 const run=vm.runInNewContext(code+";runFirstProtectionCheck",context);
 return {run,state,events,persisted,requests,element};
}

test("first check succeeds only after a tenant state write is acknowledged",async()=>{
 const h=fixture();
 assert.equal(await h.run(),true);
 assert.equal(h.persisted.length,1);
 assert.equal(h.persisted[0].firstProtectionCheckStatus,"complete");
 assert.ok(!Number.isNaN(Date.parse(h.persisted[0].firstProtectionCheckAt)));
 assert.deepEqual(h.events.slice(0,3),["save-attempt","save-ack","success:1"]);
});

test("partial rule failure persists pending and offers retry, never success",async()=>{
 const h=fixture({failRule:true});
 assert.equal(await h.run(),false);
 assert.equal(h.persisted[0].firstProtectionCheckStatus,"pending");
 assert.equal(h.persisted[0].firstProtectionCheckAt,null);
 assert.equal(h.events.some(x=>x.startsWith("success:")),false);
 assert.match(h.events.join(" "),/retry:Some checks could not finish/);
});

test("calendar failure also cannot confirm a first successful check",async()=>{
 const h=fixture({failCalendar:true});
 assert.equal(await h.run(),false);
 assert.equal(h.persisted[0].firstProtectionCheckStatus,"pending");
 assert.equal(h.events.some(x=>x.startsWith("success:")),false);
});

test("failed server state save reports retry and leaves no local completion",async()=>{
 const h=fixture({failSave:true});
 assert.equal(await h.run(),false);
 assert.equal(h.persisted.length,0);
 assert.equal(h.state.profile.firstProtectionCheckStatus,"pending");
 assert.equal(h.state.profile.firstProtectionCheckAt,null);
 assert.equal(h.events.some(x=>x.startsWith("success:")),false);
 assert.match(h.events.join(" "),/retry:State save unavailable/);
});

test("failed action read does not persist a false first value",async()=>{
 const h=fixture({failActions:true});
 assert.equal(await h.run(),false);
 assert.equal(h.persisted.length,0);
 assert.equal(h.events.some(x=>x.startsWith("success:")),false);
 assert.match(h.events.join(" "),/retry:Actions unavailable/);
});

test("manager cannot run owner-only onboarding checks or perform writes",async()=>{
 const h=fixture({role:"manager"});
 assert.equal(await h.run(),false);
 assert.deepEqual(h.requests,[]);
 assert.deepEqual(h.events,[]);
 assert.equal(h.persisted.length,0);
});
