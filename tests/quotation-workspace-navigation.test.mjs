import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../public/js/components.js",import.meta.url),"utf8");
const marker="(function installLovelyQuotationWorkspaceNavigation(global){";
const start=source.indexOf(marker);
assert(start>=0,"Lovely quotations workspace entry must be installed");
const script=new vm.Script(source.slice(start),{filename:"components.js quotation navigation"});

function harness({role="Owner",status=200,documentStart="<!doctype html><html><title>Customer quotation | Thebe Desk</title>"}={}){
  const listeners=new Map(),nodes=new Map(),observed=new Map(),calls=[],navigation=[];
  const element=(tag)=>({
    tag,hidden:false,disabled:false,children:[],style:{display:"",visibility:""},
    classList:{contains:()=>false},
    setAttribute(name,value){this[name]=String(value)},
    append(...items){this.children.push(...items)},
    addEventListener(name,fn){this.listeners??={};this.listeners[name]=fn},
    after(next){nodes.set(next.id,next)}
  });
  const nav=element("div"),money=element("button"),roleLabel=element("span"),shell=element("div");
  roleLabel.textContent=role;
  shell.style.display="block";shell.style.visibility="visible";
  nav.querySelector=(selector)=>selector==='button[data-view="moneyhub"]'?money:null;
  for(const [name,node] of [["nav",nav],["roleLabel",roleLabel],["appShell",shell]])nodes.set(name,node);
  const document={
    readyState:"complete",
    getElementById(name){return nodes.get(name)||null},
    createElement:element,
    head:{append(){}}
  };
  const win={
    document,BW:{api:{createClient:(config)=>({request:async (path,options)=>{calls.push({path,options,config});if(status!==200)throw Error("access_denied");return {message:documentStart}}})}},
    __THEBE_WORKSPACE_READY__:false,
    location:{assign:(path)=>navigation.push(path)},
    addEventListener:(name,fn)=>listeners.set(name,fn)
  };
  class MutationObserver{constructor(callback){this.callback=callback}observe(node){observed.set(node,this.callback)}}
  script.runInNewContext({window:win,document,MutationObserver,Promise});
  const button=nodes.get("workspaceCustomerQuotationNav");
  assert(button,"Quotations must be available as a sidebar entry");
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  return {win,button,roleLabel,shell,calls,navigation,listeners,observed,flush,
    emitReady(){win.__THEBE_WORKSPACE_READY__=true;listeners.get("thebe:workspace-ready")()},
    setRole(value){roleLabel.textContent=value;observed.get(roleLabel)()},
    setShellHidden(){shell.style.display="none";observed.get(shell)()}
  };
}

{
  const ui=harness();
  assert.equal(ui.button.hidden,true,"navigation must start hidden");
  ui.emitReady();await ui.flush();
  assert.equal(ui.button.hidden,false,"authorized owner should see Quotations");
  assert.equal(ui.button.disabled,false);
  assert.equal(ui.button.children[1].textContent,"Quotations");
  assert.equal(ui.calls.length,1);
  assert.equal(ui.calls[0].path,"/app/quotations/customer-ready/");
  assert.equal(ui.calls[0].options.method,"GET");
  assert.equal(ui.calls[0].config.retries,0);
  assert(source.includes("global.BW.api.createClient"),"Use the centralized API transport");
  ui.button.listeners.click();
  assert.deepEqual(ui.navigation,["/app/quotations/customer-ready/"]);
  ui.setRole("Manager");await ui.flush();
  assert.equal(ui.button.hidden,true,"manager must not see owner-only quotation entry");
  ui.button.listeners.click();
  assert.equal(ui.navigation.length,1,"manager click may not navigate");
  ui.setShellHidden();await ui.flush();
  assert.equal(ui.button.hidden,true,"signed-out shell must conceal quotation entry");
}
for(const {status,documentStart} of [
  {status:404,documentStart:"Not found"},
  {status:302,documentStart:"Redirected"},
  {status:200,documentStart:"{\"error\":\"success\"}"},
  {status:200,documentStart:"<!doctype html><title>Wrong page</title>"}
]){
  const ui=harness({status,documentStart});
  ui.emitReady();await ui.flush();
  assert.equal(ui.button.hidden,true,"unexpected route response must fail closed");
  ui.button.listeners.click();
  assert.equal(ui.navigation.length,0);
}
{
  const ui=harness({role:"Manager"});
  ui.emitReady();await ui.flush();
  assert.equal(ui.calls.length,0,"non-owner must not probe the owner-only quotation route");
  assert.equal(ui.button.hidden,true);
}
const protectedRoute=fs.readFileSync(new URL("../cloudflare/src/quotation-browser-preview.js",import.meta.url),"utf8");
for(const requirement of ['user.tenantId!==tenant','user.role!=="owner"','user.onboardingComplete!==true']){
  assert(protectedRoute.includes(requirement),"Server quotation route must retain: "+requirement);
}
console.log("Lovely quotations sidebar access contract passed");
