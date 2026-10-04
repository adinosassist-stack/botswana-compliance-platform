(function bootstrapBwComponents(global){
  "use strict";
  function element(tag,{className="",text=null,attrs={}}={},children=[]){
    const node=document.createElement(tag);if(className)node.className=className;if(text!==null)node.textContent=String(text);
    for(const [key,value] of Object.entries(attrs)){if(value===false||value==null)continue;if(value===true)node.setAttribute(key,"");else node.setAttribute(key,String(value))}
    for(const child of children.flat()){if(child==null)continue;node.append(child instanceof Node?child:document.createTextNode(String(child)))}return node;
  }
  function renderList(target,items,renderItem,{emptyText="Nothing to show."}={}){
    if(!target)return;const frag=document.createDocumentFragment();
    if(!Array.isArray(items)||!items.length)frag.appendChild(element("div",{className:"muted small",text:emptyText}));
    else for(const item of items){const node=renderItem(item);if(node)frag.appendChild(node)}
    target.replaceChildren(frag);
  }
  global.BW=global.BW||{};global.BW.components=Object.freeze({element,renderList});
})(window);

(function installWorkspaceEntryBillingBudget(global){
  "use strict";
  if(!global.fetch||!global.document||!global.Response)return;
  const nativeFetch=global.fetch.bind(global);
  const WORKSPACE_ENTRY_BILLING_BUDGET_MS=5000;
  function isProduction(){return String(global.document.querySelector('meta[name="bw-runtime-mode"]')?.content||"production").toLowerCase()==="production"}
  function isEntryBillingRequest(input,init={}){
    if(!isProduction())return false;
    const method=String(init?.method||input?.method||"GET").toUpperCase();if(method!=="GET")return false;
    let url;try{url=new URL(typeof input==="string"?input:String(input?.url||input||""),global.location?.href||"https://invalid.local/")}catch{return false}
    if(!global.location?.origin||url.origin!==global.location.origin)return false;
    const logicalBilling=url.pathname==="/api/billing/status"||url.pathname==="/__thebe_api/billing/status"||(url.pathname==="/"&&url.searchParams.get("__thebe_api_path")==="/api/billing/status");
    if(!logicalBilling)return false;
    const shell=global.document.getElementById("appShell");return !!shell&&shell.style.visibility==="hidden";
  }
  global.fetch=async function workspaceEntrySafeFetch(input,init={}){
    if(!isEntryBillingRequest(input,init))return nativeFetch(input,init);
    const controller=new AbortController(),parentSignal=init?.signal;let budgetExpired=false;
    const forwardAbort=()=>{try{controller.abort(parentSignal?.reason)}catch{controller.abort()}};
    if(parentSignal?.aborted)forwardAbort();else parentSignal?.addEventListener?.("abort",forwardAbort,{once:true});
    const timer=global.setTimeout(()=>{budgetExpired=true;try{controller.abort("workspace-entry-billing-budget")}catch{controller.abort()}},WORKSPACE_ENTRY_BILLING_BUDGET_MS);
    try{return await nativeFetch(input,{...init,signal:controller.signal})}
    catch(error){
      if(budgetExpired&&!parentSignal?.aborted){
        return new global.Response(JSON.stringify({error:"billing_status_deferred",message:"Billing status refresh deferred until workspace entry completes."}),{status:408,headers:{"content-type":"application/json","cache-control":"no-store"}})
      }
      throw error
    }finally{
      global.clearTimeout(timer);parentSignal?.removeEventListener?.("abort",forwardAbort)
    }
  };
})(window);
