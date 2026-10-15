(()=>{
  "use strict";

  const RELEASE="20261015-context-starters-v336";
  const STARTER_ATTR="data-thebe-context-starter-v336";
  let quickObserver=null,pageObserver=null,retryTimer=null,scheduled=false;

  const clean=value=>String(value||"").replace(/\s+/g," ").trim();

  function currentState(){
    try{return window.ThebeAiDock?.state?.()||null}catch{return null}
  }

  function contextKey(state){
    const context=state?.context||{};
    return clean(`${context.id||""} ${context.title||""}`).toLowerCase();
  }

  function suggestionSet(state){
    const key=contextKey(state);

    if(/money|finance|cash|recon|receiv|payment|billing|accounthub/.test(key))return [
      ["Money brief","Cash, collections and exceptions","management_brief","Summarise the money signals on this screen, including cash, collections, reconciliation or payment exceptions that need attention. Distinguish confirmed records from missing data."],
      ["What needs collection?","Prioritise receivables","ask","Which receivables or collection items need attention from the records visible in this workspace? State clearly where information is missing."],
      ["Prepare finance action","Safe next steps only","next_actions","Prepare the safest next finance actions from the current records. Do not execute payments, alter records or send communications."]
    ];

    if(/property|estate|rental|valuation/.test(key))return [
      ["Property brief","Portfolio and deal signals","management_brief","Summarise the property information on this screen, including portfolio performance, rent, debt, valuation readiness or deal risks where available."],
      ["Review this property","Grounded property analysis","ask","Review the current property or portfolio screen. Explain the important numbers, risks and missing evidence without treating estimates as professional valuations."],
      ["Prepare property action","Next step without execution","next_actions","Prepare the safest next property actions from the current records. Do not create a valuation, change portfolio records or send anything."]
    ];

    if(/people|employee|employer|employment|dailyreport|reporting|leave|team|workforce|hr/.test(key))return [
      ["People brief","Team and reporting signals","management_brief","Summarise the people, reporting and accountability items on this screen. Distinguish confirmed employee records from missing evidence."],
      ["Reporting gaps","See what needs follow-up","ask","Identify reporting, employee-record or management follow-up gaps visible on this screen. Do not infer missing facts."],
      ["Prepare follow-up","Safe people next steps","next_actions","Prepare the safest people follow-up actions from the current records. Do not change employee records, issue discipline or send communications."]
    ];

    if(/protect|compliance|obligation|evidence|licen[cs]e|cipa|burs|tax|regulatory|tender|risk|control|audit|security|assurance|inspection|privacy|passport|secretary|statutory/.test(key))return [
      ["Compliance brief","Obligations and risk signals","management_brief","Summarise the obligations, evidence, controls and risk items on this screen. Separate verified status from missing or unverified evidence."],
      ["Evidence gaps","What needs proof?","ask","Identify the evidence or control gaps visible on this screen and explain what proof would be needed to resolve them."],
      ["Prepare next control","No filing or execution","next_actions","Prepare the safest next compliance actions from the current records. Do not file, approve, certify, alter evidence or contact authorities."]
    ];

    if(/work|site|project|manufactur|branch|location|operations|workflow/.test(key))return [
      ["Operations brief","Work, sites and exceptions","management_brief","Summarise the operating work on this screen, including priorities, sites, deadlines, blockers and exceptions supported by current records."],
      ["What is blocked?","Find execution friction","ask","What work appears blocked, overdue or unclear on this screen? Distinguish confirmed blockers from missing information."],
      ["Prepare next work","Turn signals into steps","next_actions","Prepare the safest next operating steps from the current records. Do not assign, approve or execute work automatically."]
    ];

    if(/dashboard|home|businesshub|owner/.test(key))return [
      ["Owner brief","What changed across the business","management_brief","Give me a concise owner brief from the current workspace records. Highlight confirmed changes, material attention items and missing data."],
      ["Top priorities","Focus management attention","next_actions","What should management focus on next from the current workspace evidence? Rank the most useful next actions without executing them."],
      ["Explain this screen","What matters here","ask","Explain the current screen, what the main signals mean and the most useful next step based on available records."]
    ];

    return [
      ["Brief this page","Current-screen summary","management_brief","Summarise the important information on this screen. Distinguish confirmed facts from missing data and identify what needs attention."],
      ["What needs attention?","Focus the next decision","next_actions","What needs management attention on this screen? Prioritise useful next steps from current workspace records without executing them."],
      ["Explain this screen","Context and next step","ask","Explain what I can do on the current screen and suggest one useful next step grounded in available records."]
    ];
  }

  function starterButton([label,detail,mode,question]){
    const button=document.createElement("button");
    button.type="button";
    button.setAttribute(STARTER_ATTR,"1");
    button.textContent=label;
    if(detail){
      const small=document.createElement("small");
      small.textContent=detail;
      button.append(small);
    }
    button.addEventListener("click",()=>{
      const api=window.ThebeAiDock;
      if(typeof api?.ask!=="function")return;
      void api.ask(question,mode);
    });
    return button;
  }

  function apply(){
    scheduled=false;
    const api=window.ThebeAiDock;
    const state=currentState();
    const quick=document.querySelector("#thebeAiDock .thebe-ai-quick");
    if(!api||typeof api.ask!=="function"||!state||!quick)return false;
    if(state.workspaceVisible!==true||state.assistantMode==="goal_plan")return true;

    const context=state.context||{};
    const signature=[RELEASE,context.id||"",context.title||"",state.assistantMode||"ask"].join("|");
    const existing=quick.querySelectorAll(`[${STARTER_ATTR}]`).length;
    if(quick.dataset.contextStartersV336===signature&&existing===3)return true;

    const buttons=suggestionSet(state).map(starterButton);
    quick.replaceChildren(...buttons);
    quick.dataset.contextStartersV336=signature;
    quick.setAttribute("aria-label",`Suggested Thebe actions for ${clean(context.title)||"this workspace screen"}`);
    return true;
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>apply());
  }

  function bind(){
    const quick=document.querySelector("#thebeAiDock .thebe-ai-quick");
    if(!quick)return false;
    apply();

    if(typeof MutationObserver==="function"&&!quickObserver){
      quickObserver=new MutationObserver(schedule);
      quickObserver.observe(quick,{childList:true});
    }

    const pageTitle=document.getElementById("pageTitle");
    if(pageTitle&&typeof MutationObserver==="function"&&!pageObserver){
      pageObserver=new MutationObserver(schedule);
      pageObserver.observe(pageTitle,{childList:true,characterData:true,subtree:true});
    }

    window.addEventListener("thebe:workspace-view-change",schedule);
    return true;
  }

  function boot(){
    if(bind())return;
    let attempts=0;
    retryTimer=setInterval(()=>{
      attempts+=1;
      if(bind()||attempts>=80){clearInterval(retryTimer);retryTimer=null}
    },250);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
