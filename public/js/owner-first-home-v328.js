(function installOwnerFirstHomeV328(global){
  "use strict";

  const RELEASE="20261015-owner-attention-v329";
  const SHELL_ID="ownerDecisionLanes";
  const STYLE_ID="ownerDecisionLanesStyle";
  const DUE_SOON_MS=7*24*60*60*1000;
  const q=(selector,root=document)=>root.querySelector(selector);
  let scheduled=false;

  function role(){
    try{return String(global.currentWorkspaceRole?.()||global.currentUser?.role||"").toLowerCase()}
    catch{return ""}
  }
  function canView(){return ["owner","manager"].includes(role())}
  function clean(value){return String(value??"").replace(/\s+/g," ").trim()}
  function node(tag,value,className=""){
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(value!==undefined)el.textContent=String(value??"");
    return el;
  }
  function action(label,handler,className="btn soft"){
    const el=node("button",label,className);
    el.type="button";
    el.addEventListener("click",handler);
    return el;
  }

  function installStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    const nonce=document.querySelector("style[nonce],script[nonce]")?.nonce;
    if(nonce)style.nonce=nonce;
    style.textContent=`
#${SHELL_ID}{margin:12px 0 16px;min-width:0;scroll-margin-bottom:128px}
#${SHELL_ID} .owner-decision-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:10px}
#${SHELL_ID} .owner-decision-copy{min-width:0}
#${SHELL_ID} .owner-decision-title{margin:0;font-size:18px;font-weight:850;line-height:1.2}
#${SHELL_ID} .owner-decision-meta{margin-top:4px;font-size:11px;color:var(--muted,#6b7176)}
#${SHELL_ID} .owner-decision-head-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
#${SHELL_ID} .owner-decision-state{font-size:11px;font-weight:800;padding:5px 9px;border:1px solid var(--line,#e3e6e8);border-radius:999px;white-space:nowrap;background:var(--card,#fff)}
#${SHELL_ID} .owner-decision-ask{min-height:36px;padding:7px 11px;border-radius:10px;font-size:11px;font-weight:850;white-space:nowrap}
#${SHELL_ID} .owner-decision-summary{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 10px}
#${SHELL_ID} .owner-decision-summary-pill{display:inline-flex;align-items:center;gap:5px;min-height:28px;padding:4px 8px;border:1px solid var(--line,#e3e6e8);border-radius:999px;background:var(--card,#fff);font-size:10px;font-weight:750}
#${SHELL_ID} .owner-decision-summary-pill b{font-size:11px}
#${SHELL_ID} .owner-decision-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;min-width:0}
#${SHELL_ID} .owner-decision-lane{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:14px;background:var(--card,#fff);padding:11px}
#${SHELL_ID} .owner-decision-lane[data-lane="action"]{border-color:color-mix(in srgb,#b42318 34%,var(--line,#e3e6e8))}
#${SHELL_ID} .owner-decision-lane[data-lane="decision"]{border-color:color-mix(in srgb,#a66a00 34%,var(--line,#e3e6e8))}
#${SHELL_ID} .owner-decision-lane-title{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:11px;font-weight:850;letter-spacing:.02em}
#${SHELL_ID} .owner-decision-count{min-width:22px;text-align:center;border-radius:999px;padding:2px 6px;background:color-mix(in srgb,currentColor 8%,transparent);font-size:10px}
#${SHELL_ID} .owner-decision-items{display:grid;gap:8px;margin-top:9px}
#${SHELL_ID} .owner-decision-item{border-top:1px solid var(--line,#e3e6e8);padding-top:8px;min-width:0}
#${SHELL_ID} .owner-decision-item:first-child{border-top:0;padding-top:0}
#${SHELL_ID} .owner-decision-item b{display:block;font-size:12px;line-height:1.3;overflow-wrap:anywhere}
#${SHELL_ID} .owner-decision-item p{margin:4px 0 0;font-size:10px;line-height:1.35;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SHELL_ID} .owner-decision-item-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}
#${SHELL_ID} .owner-decision-tag{font-size:9px;font-weight:800;padding:2px 5px;border:1px solid var(--line,#e3e6e8);border-radius:999px;color:var(--muted,#6b7176)}
#${SHELL_ID} .owner-decision-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
#${SHELL_ID} .owner-decision-actions button{min-height:34px;padding:6px 8px;border-radius:9px;font-size:10px;font-weight:800}
#${SHELL_ID} .owner-decision-empty{margin-top:9px;font-size:10px;color:var(--muted,#6b7176)}
#${SHELL_ID} .owner-decision-unavailable{padding:12px;border:1px solid var(--line,#e3e6e8);border-radius:14px;background:var(--card,#fff);font-size:12px}
#${SHELL_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
@media(max-width:980px){#${SHELL_ID} .owner-decision-grid{grid-template-columns:1fr 1fr}#${SHELL_ID} .owner-decision-lane:last-child{grid-column:1/-1}}
@media(max-width:680px){#${SHELL_ID}{padding-bottom:max(18px,env(safe-area-inset-bottom));scroll-margin-bottom:180px}#${SHELL_ID} .owner-decision-head{align-items:center}#${SHELL_ID} .owner-decision-grid{grid-template-columns:1fr}#${SHELL_ID} .owner-decision-lane:last-child{grid-column:auto}}
@media(max-width:430px){#${SHELL_ID} .owner-decision-head{display:block}#${SHELL_ID} .owner-decision-head-actions{justify-content:flex-start;margin-top:9px}#${SHELL_ID} .owner-decision-ask{flex:1 1 auto}#${SHELL_ID} .owner-decision-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}#${SHELL_ID} .owner-decision-summary-pill{justify-content:center;padding-inline:5px}}
`;
    document.head.append(style);
  }

  function ensureShell(centre){
    let shell=q(`#${SHELL_ID}`,centre);
    if(shell)return shell;
    installStyles();
    shell=node("section");
    shell.id=SHELL_ID;
    shell.dataset.release=RELEASE;
    shell.setAttribute("aria-label","Owner attention");
    shell.setAttribute("aria-live","polite");
    const attention=q("#ownerAttentionPanel",centre);
    const focus=q("#ownerFocusStrip",centre);
    if(attention)attention.insertAdjacentElement("beforebegin",shell);
    else if(focus)focus.insertAdjacentElement("afterend",shell);
    else centre.prepend(shell);
    return shell;
  }

  function snapshot(){
    try{return global.ThebeOwnerFocusStrip?.canonicalSnapshot?.()||null}
    catch{return null}
  }

  function itemText(item){
    return [item?.title,item?.summary,item?.detail,item?.description,item?.category,item?.sourceType,item?.authority,item?.kind,item?.truthState,item?.status]
      .map(clean).filter(Boolean).join(" ").toLowerCase();
  }
  function dueAt(item){
    const stamp=Date.parse(String(item?.dueAt||item?.due_at||item?.deadlineAt||item?.deadline||item?.dueDate||""));
    return Number.isFinite(stamp)?stamp:null;
  }
  function isOverdue(item){
    const due=dueAt(item);
    return item?.overdue===true||(due!==null&&due<Date.now());
  }
  function isDueSoon(item){
    const due=dueAt(item);
    return due!==null&&due>=Date.now()&&due-Date.now()<=DUE_SOON_MS;
  }
  function isRisk(item){
    const severity=clean(item?.severity||item?.priority||item?.tone).toLowerCase();
    return isOverdue(item)||["critical","urgent","high","red","risk"].includes(severity);
  }
  function isDecision(item){
    const hay=itemText(item);
    return item?.requiresApproval===true||item?.requiresOwner===true||/(approval|approve|owner decision|decision required|waiting for you|review required|needs review|pending review)/.test(hay);
  }
  function isBlocked(item){
    const hay=itemText(item);
    return item?.blocked===true||item?.waiting===true||/(blocked|awaiting|waiting on|waiting for|dependency|dependent on|delayed|pending supplier|pending client|pending response|no response)/.test(hay);
  }
  function isMoney(item){
    return /(money|finance|financial|cash|bank|reconcil|payment|invoice|billing|expense|revenue|payroll|tax|burs)/.test(itemText(item));
  }
  function isRecommendation(item){
    return item?.recommendation===true||/(recommend|suggest|prepared|advice|next best|opportunity)/.test(itemText(item));
  }
  function classify(item){
    if(isRisk(item)||isOverdue(item))return "action";
    if(isDecision(item))return "decision";
    if(isBlocked(item))return "waiting";
    if(isMoney(item)||isDueSoon(item))return "action";
    if(isRecommendation(item))return "decision";
    return "action";
  }
  function priorityScore(item){
    let score=0;
    if(isOverdue(item))score+=100;
    if(isRisk(item))score+=70;
    if(isDecision(item))score+=45;
    if(isDueSoon(item))score+=30;
    if(isMoney(item))score+=20;
    if(isBlocked(item))score+=10;
    const due=dueAt(item);
    if(due!==null)score+=Math.max(0,8-Math.floor(Math.max(0,due-Date.now())/(24*60*60*1000)));
    return score;
  }

  function itemRoute(item){
    const direct=clean(item?.route||item?.view||item?.workspaceView||item?.targetView);
    if(direct)return direct.replace(/^#/,"");
    const hay=itemText(item);
    if(/(invoice|cash|bank|finance|payment|reconcil|revenue|expense)/.test(hay))return "moneyhub";
    if(/(employee|people|leave|payroll)/.test(hay))return "peopleops";
    if(/(cipa|burs|compliance|obligation|licence|license|regulat)/.test(hay))return "obligations";
    if(/(property|valuation|land|lease)/.test(hay))return "propertyintelligence";
    return "";
  }
  function review(item){
    const view=itemRoute(item);
    if(view&&typeof global.showView==="function"){
      try{global.showView(view)}catch{}
    }
  }
  function setDockPrompt(prompt){
    const dock=q('#thebeAiDock[data-surface="workspace"]')||q("#thebeAiDock");
    const input=dock&&q('textarea,input[type="text"],input:not([type])',dock);
    if(input){
      input.value=prompt;
      input.dispatchEvent(new Event("input",{bubbles:true}));
      try{input.focus({preventScroll:true})}catch{input.focus()}
      return true;
    }
    global.ThebeOwnerFocusStrip?.focusThebe?.();
    return false;
  }
  function askThebe(item){
    const title=clean(item?.title||"this owner priority");
    setDockPrompt(`Explain “${title}” using the current verified business context. Show evidence, risk, and the safest next step. Do not execute anything.`);
  }
  function askThebeQueue(items){
    const top=items.slice().sort((a,b)=>priorityScore(b)-priorityScore(a)).slice(0,5).map(item=>clean(item?.title||item?.label||item?.name)).filter(Boolean);
    const focus=top.length?` Focus first on: ${top.join("; ")}.`:"";
    setDockPrompt(`Brief me on my verified owner-attention queue.${focus} Separate what needs action now, what needs my decision, and what is waiting or blocked. Show evidence and the safest next step for each. Do not execute anything.`);
  }

  function dueLabel(item){
    const due=dueAt(item);
    if(due===null)return "";
    if(isOverdue(item))return "Overdue";
    if(isDueSoon(item))return "Due soon";
    return "";
  }
  function itemCard(item){
    const card=node("article");
    card.className="owner-decision-item";
    const title=clean(item?.title||item?.label||item?.name||"Owner attention item");
    const detail=clean(item?.summary||item?.detail||item?.description||item?.reason||"");
    card.append(node("b",title));
    if(detail)card.append(node("p",detail.slice(0,180)));
    const tags=[];
    const due=dueLabel(item);
    if(due)tags.push(due);
    if(isMoney(item))tags.push("Money");
    if(isBlocked(item)&&!isRisk(item))tags.push("Waiting");
    if(tags.length){
      const meta=node("div");
      meta.className="owner-decision-item-meta";
      tags.slice(0,2).forEach(tag=>meta.append(node("span",tag,"owner-decision-tag")));
      card.append(meta);
    }
    const controls=node("div");
    controls.className="owner-decision-actions";
    if(itemRoute(item))controls.append(action("Review",()=>review(item),"btn soft"));
    controls.append(action("Ask Thebe",()=>askThebe(item),"btn alt"));
    card.append(controls);
    return card;
  }

  function lane(label,key,items,emptyCopy){
    const section=node("section");
    section.className="owner-decision-lane";
    section.dataset.lane=key;
    const head=node("div");
    head.className="owner-decision-lane-title";
    head.append(node("span",label),node("span",String(items.length),"owner-decision-count"));
    section.append(head);
    if(!items.length){
      section.append(node("div",emptyCopy,"owner-decision-empty"));
      return section;
    }
    const list=node("div");
    list.className="owner-decision-items";
    items.slice().sort((a,b)=>priorityScore(b)-priorityScore(a)).slice(0,3).forEach(item=>list.append(itemCard(item)));
    section.append(list);
    if(items.length>3)section.append(node("div",`${items.length-3} more in the verified queue`,"owner-decision-empty"));
    return section;
  }

  function summaryPill(label,count){
    const pill=node("span",undefined,"owner-decision-summary-pill");
    pill.append(node("b",String(count)),node("span",label));
    return pill;
  }

  function render(){
    scheduled=false;
    const centre=q("#ownerCommandCentre");
    if(!centre||!canView()||centre.hidden)return;
    const shell=ensureShell(centre);
    const data=snapshot();
    const state=clean(data?.state).toLowerCase();
    const items=Array.isArray(data?.items)?data.items:[];
    const itemSignature=items.map(item=>[
      clean(item?.id||item?.key||item?.title||item?.name),
      clean(item?.status||item?.priority||item?.severity),
      clean(item?.dueAt||item?.due_at||item?.deadlineAt||item?.deadline||item?.dueDate),
      Boolean(item?.blocked),Boolean(item?.waiting),Boolean(item?.requiresApproval),Boolean(item?.requiresOwner)
    ]);
    const signature=JSON.stringify({state,generatedAt:data?.generatedAt||null,version:data?.version||null,items:itemSignature});
    if(shell.dataset.signature===signature)return;
    shell.dataset.signature=signature;
    shell.dataset.state=state||"loading";
    shell.replaceChildren();

    const head=node("div");
    head.className="owner-decision-head";
    const copy=node("div",undefined,"owner-decision-copy");
    copy.append(node("div","Owner attention","section-eyebrow"),node("h3","What needs you now","owner-decision-title"));
    const generated=data?.generatedAt?new Date(data.generatedAt):null;
    copy.append(node("div",generated&&!Number.isNaN(generated.getTime())?`Verified ${generated.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`:"Canonical owner queue","owner-decision-meta"));
    const headActions=node("div",undefined,"owner-decision-head-actions");
    headActions.append(node("span",state==="ready"?"Verified":state==="unavailable"?"Unavailable":"Loading","owner-decision-state"));
    if(state==="ready"&&items.length)headActions.append(action("Ask Thebe",()=>askThebeQueue(items),"btn alt owner-decision-ask"));
    head.append(copy,headActions);
    shell.append(head);

    if(!data||!state||state==="loading"){
      shell.append(node("div","Loading the verified owner queue…","owner-decision-unavailable"));
      return;
    }
    if(state!=="ready"){
      const box=node("div");
      box.className="owner-decision-unavailable";
      box.append(node("b","Priority data is incomplete."),node("div","Retry the canonical Owner Focus queue. Thebe will not infer missing obligations or widen authority.","muted small"));
      const retry=q("#ownerFocusStrip .owner-focus-retry");
      if(retry&&!retry.hidden)box.append(action("Retry verified priorities",()=>retry.click(),"btn soft"));
      shell.append(box);
      return;
    }
    if(!items.length){
      shell.append(node("div","You’re clear for now. No verified owner-attention items are open.","owner-decision-unavailable"));
      return;
    }

    const lanes={action:[],decision:[],waiting:[]};
    items.forEach(item=>lanes[classify(item)].push(item));

    const summary=node("div",undefined,"owner-decision-summary");
    summary.setAttribute("aria-label","Owner attention summary");
    summary.append(
      summaryPill("act now",lanes.action.length),
      summaryPill("decide",lanes.decision.length),
      summaryPill("waiting",lanes.waiting.length)
    );
    shell.append(summary);

    const grid=node("div");
    grid.className="owner-decision-grid";
    grid.append(
      lane("Act now","action",lanes.action,"No verified urgent action right now."),
      lane("Needs your decision","decision",lanes.decision,"No verified decisions waiting for you."),
      lane("Waiting / blocked","waiting",lanes.waiting,"Nothing verified as blocked or awaiting a dependency.")
    );
    shell.append(grid);
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    global.setTimeout(render,50);
  }
  function boot(){
    schedule();
    [180,450,1200].forEach(delay=>global.setTimeout(schedule,delay));
    const root=q("#homeDecisionCenter")||document.body;
    new MutationObserver(schedule).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:["class","hidden","data-state","data-release","data-canonical-version"]});
    global.addEventListener?.("thebe:auth:state",schedule);
    global.addEventListener?.("thebe:identity:ready",schedule);
    global.addEventListener?.("thebe:workspace:view",schedule);
    document.addEventListener("change",event=>{if(event.target?.id==="companySelect")global.setTimeout(schedule,550)});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();

  global.ThebeOwnerFirstHome=Object.freeze({release:RELEASE,refresh:schedule,classify});
})(window);
