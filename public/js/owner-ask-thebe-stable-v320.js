(()=>{
  "use strict";

  const RELEASE="20261011-owner-ask-control-v320";
  const FORM_SELECTOR='form[aria-label="Ask Thebe a question"]';

  const text=(tag,value,className="")=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    node.textContent=String(value??"");
    return node;
  };

  function ensureAskStatus(section){
    let status=section.querySelector("#ownerAskThebeStatus");
    if(status)return status;
    status=text("span","Ready for a question.","owner-input-status");
    status.id="ownerAskThebeStatus";
    status.setAttribute("role","status");
    status.setAttribute("aria-live","polite");
    section.append(status);
    return status;
  }

  function buildAskSection(){
    const section=document.createElement("section");
    section.className="owner-agentic-boundary";
    section.dataset.askControlRelease=RELEASE;

    const copy=document.createElement("div");
    copy.append(
      text("b","Ask Thebe"),
      text("span","Ask a company-specific question or a general question. Company facts stay tenant-scoped; general knowledge is never presented as company data.")
    );

    const form=document.createElement("form");
    form.setAttribute("aria-label","Ask Thebe a question");
    const question=document.createElement("textarea");
    question.id="ownerThebeQuestion";
    question.rows=3;
    question.maxLength=1000;
    question.placeholder="Example: Why is our cash position different from revenue? Or: What is gross margin?";
    question.setAttribute("aria-label","Question for Thebe");
    const submit=document.createElement("button");
    submit.type="submit";
    submit.className="btn";
    submit.textContent="Ask Thebe";
    form.append(question,submit);

    section.append(copy,form);
    ensureAskStatus(section);
    return section;
  }

  function askSectionFrom(node){
    const form=node?.querySelector?.(FORM_SELECTOR);
    return form?.closest?.(".owner-agentic-boundary")||null;
  }

  function syncStableAsk(panel,body,host){
    let stable=askSectionFrom(host);
    if(!stable){
      const existing=askSectionFrom(body);
      stable=existing||buildAskSection();
      ensureAskStatus(stable);
      stable.dataset.askControlRelease=RELEASE;
      host.replaceChildren(stable);
    }else{
      ensureAskStatus(stable);
      stable.dataset.askControlRelease=RELEASE;
    }

    const duplicates=[...body.querySelectorAll(FORM_SELECTOR)];
    duplicates.forEach(form=>{
      const section=form.closest(".owner-agentic-boundary");
      if(section&&!host.contains(section))section.remove();
    });
  }

  function bind(){
    const panel=document.getElementById("ownerAgenticPanel");
    const body=document.getElementById("ownerAgenticBody");
    if(!panel||!body)return false;

    let host=panel.querySelector("#ownerAskThebeStableHost");
    if(!host){
      host=document.createElement("div");
      host.id="ownerAskThebeStableHost";
      host.className="owner-agentic-stable-host";
      host.dataset.askControlRelease=RELEASE;
      body.after(host);
    }

    syncStableAsk(panel,body,host);
    if(panel.dataset.askControlV320!=="1"&&typeof MutationObserver==="function"){
      panel.dataset.askControlV320="1";
      const observer=new MutationObserver(()=>syncStableAsk(panel,body,host));
      observer.observe(body,{childList:true,subtree:true});
    }

    window.__THEBE_OWNER_ASK_CONTROL_RELEASE__=RELEASE;
    return true;
  }

  function install(){
    if(bind())return;
    if(typeof MutationObserver!=="function")return;
    const root=document.getElementById("mainContent")||document.body||document.documentElement;
    if(!root)return;
    const wait=new MutationObserver(()=>{if(bind())wait.disconnect()});
    wait.observe(root,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})();
