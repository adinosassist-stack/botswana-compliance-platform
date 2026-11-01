(()=>{
  "use strict";

  const RELEASE="20261011-owner-ask-render-v321";
  let busy=false;
  let creditInitPromise=null;
  const generalAiEnabled=()=>document.querySelector('meta[name="thebe-general-ai-enabled"]')?.content==="true";
  // Keep tenant-sensitive questions on the separately authorized workspace advisor.
  // Client-side routing never replaces server authorization.
  const privateWorkspaceQuestion=question=>/\b(my (?:company|business|invoices?|reconciliation|employees?|payments?|subscriptions?|workspace|customers?)|our (?:company|accounts?|payments?|clients?)|thebe (?:workspace|account|billing))\b/i.test(question);
  const actionQuestion=question=>/\b(transfer money|send payment|approve payment|activate subscription|file tax|delete records|change payroll|sign contract)\b/i.test(question);
  const useGeneralAi=question=>generalAiEnabled()&&!privateWorkspaceQuestion(question)&&!actionQuestion(question);

  const text=(tag,value,className="")=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    node.textContent=String(value??"");
    return node;
  };

  function statusNode(form=null){
    const section=form?.closest?.(".owner-agentic-boundary");
    return section?.querySelector?.("#ownerAskThebeStatus")||document.getElementById("ownerAgenticStatus");
  }

  function ensureAiCreditsReady(){
    if(creditInitPromise)return creditInitPromise;
    creditInitPromise=window.apiJson("/api/ai/credits").catch(error=>{
      creditInitPromise=null;
      throw error;
    });
    return creditInitPromise;
  }

  function renderAnswer(form,result){
    const section=form.closest(".owner-agentic-boundary");
    if(!section||!result?.answer)return false;
    section.querySelectorAll(":scope > .owner-agentic-run").forEach(node=>node.remove());

    const card=document.createElement("article");
    card.className="owner-agentic-run";
    card.dataset.askRenderRelease=RELEASE;
    const confidence=String(result.confidence||(result.researchPerformed?"sourced":"general")).toUpperCase();
    const mode=String(result.generationMode||"governed").replaceAll("_"," ");
    card.append(
      text("span",`${confidence} confidence · ${mode}`,"owner-agentic-kicker"),
      text("h4","Thebe"),
      text("p",String(result.answer),"owner-agentic-reason")
    );

    const references=Array.isArray(result.references)?result.references:[];
    const citations=Array.isArray(result.citations)?result.citations:[];
    if(citations.length){
      const sources=document.createElement("div");
      sources.className="owner-agentic-sources";
      citations.slice(0,8).forEach(source=>{
        try{
          const url=new URL(source.url);
          // Defense in depth: never turn an AI-supplied URL into an internal or credentialed link.
          if(url.protocol!=="https:"||url.username||url.password||url.port||/^(?:localhost|.*\\.localhost|.*\\.local)$/i.test(url.hostname)||/^\\d+\\.\\d+\\.\\d+\\.\\d+$/.test(url.hostname)||url.hostname.includes(":"))return;
          const link=text("a",source.title||url.hostname,"owner-agentic-source");
          link.href=url.href;link.target="_blank";link.rel="noopener noreferrer";link.referrerPolicy="no-referrer";
          sources.append(link);
        }catch{}
      });
      card.append(sources);
    }
    if(result.notice)card.append(text("div",result.notice,"owner-agentic-policy"));
    if(result.researchPerformed===true)card.append(text("div","Research sources are search excerpts; verify important claims against the linked original publications.","owner-agentic-policy"));
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
    const status=statusNode(form);
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
    if(status)status.textContent="Preparing your AI allowance…";

    try{
      const general=useGeneralAi(normalized);
      if(!general)await ensureAiCreditsReady();
      const answeringStatus=statusNode(form);
      if(answeringStatus)answeringStatus.textContent="Thebe is answering your question…";
      const result=general
        ?await window.apiJson("/api/ai/general",{method:"POST",body:JSON.stringify({question:normalized})})
        :await window.apiJson("/api/ai/advisor",{method:"POST",body:JSON.stringify({mode:"ask",question:normalized})});
      if(!renderAnswer(form,result))throw new Error("Thebe returned no answer.");
      const refreshedStatus=statusNode(form);
      if(refreshedStatus)refreshedStatus.textContent="Answer ready · no action was executed.";
    }catch(error){
      const refreshedStatus=statusNode(form);
      if(refreshedStatus)refreshedStatus.textContent=String(error?.message||"Thebe could not answer that question.").slice(0,180);
    }finally{
      busy=false;
      if(submit){submit.disabled=false;submit.textContent="Ask Thebe"}
    }
  }

  document.addEventListener("submit",handleAskSubmit,true);
  window.__THEBE_OWNER_ASK_RENDER_RELEASE__=RELEASE;
})();
