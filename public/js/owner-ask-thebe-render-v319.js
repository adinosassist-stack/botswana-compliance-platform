(()=>{
  "use strict";

  const RELEASE="20261011-owner-ask-render-v319";
  let busy=false;

  const text=(tag,value,className="")=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    node.textContent=String(value??"");
    return node;
  };

  function statusNode(){return document.getElementById("ownerAgenticStatus")}

  function renderAnswer(form,result){
    const section=form.closest(".owner-agentic-boundary");
    if(!section||!result?.answer)return false;
    section.querySelectorAll(":scope > .owner-agentic-run").forEach(node=>node.remove());

    const card=document.createElement("article");
    card.className="owner-agentic-run";
    card.dataset.askRenderRelease=RELEASE;
    const confidence=String(result.confidence||"low").toUpperCase();
    const mode=String(result.generationMode||"governed").replaceAll("_"," ");
    card.append(
      text("span",`${confidence} confidence · ${mode}`,"owner-agentic-kicker"),
      text("h4","Thebe"),
      text("p",String(result.answer),"owner-agentic-reason")
    );

    const references=Array.isArray(result.references)?result.references:[];
    if(references.length){
      const refs=document.createElement("div");
      refs.className="owner-agentic-sources";
      references.slice(0,8).forEach(item=>refs.append(text("span",String(item?.label||item?.ref||"Workspace source"),"owner-agentic-source")));
      card.append(refs);
    }

    const caveats=Array.isArray(result.caveats)?result.caveats.filter(Boolean).slice(0,4):[];
    if(caveats.length)card.append(text("div",caveats.join(" · "),"owner-agentic-policy"));

    const actions=Array.isArray(result.actions)?result.actions.filter(item=>item?.title).slice(0,4):[];
    if(actions.length){
      const suggestions=document.createElement("div");
      suggestions.className="owner-agentic-proposals";
      actions.forEach(item=>{
        const suggestion=document.createElement("div");
        suggestion.className="owner-command-empty";
        suggestion.append(text("b",item.title),text("span",item.reason||""));
        suggestions.append(suggestion);
      });
      card.append(suggestions);
    }

    section.append(card);
    return true;
  }

  async function handleAskSubmit(event){
    const form=event.target;
    if(!(form instanceof HTMLFormElement)||form.getAttribute("aria-label")!=="Ask Thebe a question")return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if(busy)return;

    const question=form.querySelector("#ownerThebeQuestion");
    const normalized=String(question?.value||"").trim().replace(/\s+/g," ").slice(0,1000);
    const status=statusNode();
    if(normalized.length<3){
      if(status)status.textContent="Enter a question for Thebe.";
      return;
    }
    if(typeof window.apiJson!=="function"){
      if(status)status.textContent="The secure Thebe API transport is not available.";
      return;
    }

    busy=true;
    const submit=form.querySelector('button[type="submit"]');
    if(submit){submit.disabled=true;submit.textContent="Answering…"}
    if(status)status.textContent="Thebe is answering your question…";

    try{
      const result=await window.apiJson("/api/ai/advisor",{
        method:"POST",
        body:JSON.stringify({mode:"ask",question:normalized})
      });
      if(!renderAnswer(form,result))throw new Error("Thebe returned no answer.");
      const refreshedStatus=statusNode();
      if(refreshedStatus)refreshedStatus.textContent="Answer ready · no action was executed.";
    }catch(error){
      const refreshedStatus=statusNode();
      if(refreshedStatus)refreshedStatus.textContent=String(error?.message||"Thebe could not answer that question.").slice(0,180);
    }finally{
      busy=false;
      if(submit){submit.disabled=false;submit.textContent="Ask Thebe"}
    }
  }

  document.addEventListener("submit",handleAskSubmit,true);
  window.__THEBE_OWNER_ASK_RENDER_RELEASE__=RELEASE;
})();
