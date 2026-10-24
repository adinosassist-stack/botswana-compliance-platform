import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function fakeNode(tag="div"){
  const listeners=new Map();
  const classes=new Set();
  return {
    tagName:tag,className:"",textContent:"",hidden:false,disabled:false,value:"",
    children:[],classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},
    addEventListener:(name,fn)=>listeners.set(name,fn),
    append(...items){this.children.push(...items)},
    replaceChildren(...items){this.children=[...items]},
    async trigger(name){const callback=listeners.get(name);assert.ok(callback,`missing ${name} handler`);return callback()},
    setAttribute(){}
  };
}
function harness(preflight){
  const elements=new Map(),requests=[],nodes={};
  const byId=id=>{if(!elements.has(id))elements.set(id,fakeNode());return elements.get(id)};
  for(const id of [
    "reviewConsole","sessionNotice","readinessNotice","principalCount","approvedSourceCount",
    "publishedRuleCount","conflictCount","sourceCount","ruleCount","sourceList","ruleList",
    "refreshBtn","preflightBtn","preflightStatus","preflightSummary","preflightList"
  ])byId(id);
  const routes={
    "/api/auth/me":{csrfToken:"example-csrf"},
    "/api/platform/regulatory/status":{role:"reviewer",email:"checker@example.test"},
    "/api/platform/regulatory/readiness":{makerCheckerReady:true,principals:{active:2},sources:{verifiedApproved:0},rules:{published:0},openConflicts:0,blockers:["no_verified_approved_sources"]},
    "/api/platform/regulatory/sources":{items:[]},
    "/api/platform/regulatory/rules":{items:[]},
    "/api/platform/regulatory/foundation-pack?preflight=1":preflight
  };
  const document={readyState:"complete",getElementById:byId,createElement:fakeNode};
  const window={document,location:{assign:()=>{throw new Error("unexpected redirect")}},
    BW:{api:{createClient:()=>({request:async(path,options={})=>{
      requests.push({path,method:options.method||"GET"});
      if(!Object.hasOwn(routes,path))throw new Error(`Unexpected request: ${path}`);
      return routes[path];
    }})}}
  };
  const source=fs.readFileSync(new URL("../public/js/regulatory-review-console.js",import.meta.url),"utf8");
  vm.runInNewContext(source,{window,console},{timeout:1500});
  return {elements,requests,byId,window};
}
async function boot(h){
  for(let i=0;i<30&&!h.byId("preflightBtn").disabled;i++)await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
}
const sample={
  readOnly:true,noApprovalOrImport:true,
  preflight:{
    ok:false,version:"1.8",counts:{source_metadata_drift_requires_review:1,refresh_unreviewed:1,create:1,reuse:21},
    sources:[
      {key:"legacy-egp",sourceId:"s1",action:"source_metadata_drift_requires_review",
       status:"approved",verificationStatus:"verified",snapshotCount:1,reviewCount:1,
       changedFields:["publication_date","notes"]},
      {key:"old-vat-guidance",sourceId:"s2",action:"refresh_unreviewed",
       status:"pending",verificationStatus:"unverified",snapshotCount:0,reviewCount:0,
       changedFields:["notes"]},
      {key:"new-2026-act",sourceId:null,action:"create",changedFields:[],snapshotCount:0,reviewCount:0},
      {key:"unchanged",sourceId:"s4",action:"reuse",changedFields:[],snapshotCount:0,reviewCount:0}
    ]
  }
};

test("reviewer inspects protected drift in read-only mode without API mutation",async()=>{
  const h=harness(sample);await boot(h);
  const before=h.requests.length;
  await h.byId("preflightBtn").trigger("click");
  const later=h.requests.slice(before);
  assert.deepEqual(later,[{path:"/api/platform/regulatory/foundation-pack?preflight=1",method:"GET"}]);
  assert.match(h.byId("preflightStatus").textContent,/1 source\(s\) require manual evidence reconciliation/);
  assert.equal(h.byId("preflightSummary").children.length,4);
  assert.equal(h.byId("preflightList").children.length,3);
  assert.ok(h.byId("preflightList").children[0].children[0].children[0].textContent.includes("legacy-egp"));
  assert.ok(h.requests.every(x=>x.method==="GET"));
  assert.equal(h.byId("preflightBtn").disabled,false);
});

test("malformed response fails closed and never signals successful inspection",async()=>{
  const h=harness({preflight:sample.preflight,readOnly:false,noApprovalOrImport:true});
  await boot(h);
  await h.byId("preflightBtn").trigger("click");
  assert.match(h.byId("preflightStatus").textContent,/Invalid read-only preflight response/);
  assert.equal(h.byId("preflightSummary").children.length,0);
  assert.ok(h.requests.every(x=>x.method==="GET"));
});

test("clean preflight does not suggest approval or import",async()=>{
  const result=structuredClone(sample);
  result.preflight.ok=true;
  result.preflight.counts={source_metadata_drift_requires_review:0,refresh_unreviewed:0,create:0,reuse:24};
  result.preflight.sources=[];
  const h=harness(result);await boot(h);
  await h.byId("preflightBtn").trigger("click");
  assert.match(h.byId("preflightStatus").textContent,/Any actual import still requires separate authorised review/);
  assert.match(h.byId("preflightList").children[0].textContent,/does not authorize an import/);
  assert.ok(h.requests.every(x=>x.method==="GET"));
});
