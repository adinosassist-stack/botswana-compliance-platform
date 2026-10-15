(function installOwnerFirstHomeV328(global){
  "use strict";

  const RELEASE="20261015-owner-decision-memory-v330";
  const SHELL_ID="ownerDecisionLanes";
  const STYLE_ID="ownerDecisionLanesStyle";
  const DIALOG_ID="ownerDecisionMemoryDialog";
  const DUE_SOON_MS=7*24*60*60*1000;
  const q=(selector,root=document)=>root.querySelector(selector);
  let scheduled=false;
  let decisionDialogItem=null;
  const recordedDecisionKeys=new Set();

  function role(){
    try{return String(global.currentWorkspaceRole?.()||global.currentUser?.role||"").toLowerCase()}
    catch{return ""}
  }
  function canView(){return ["owner","manager"].includes(role())}
  function isOwner(){return role()==="owner"}
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
#${DIALOG_ID}{width:min(560px,calc(100vw - 24px));max-height:min(760px,calc(100vh - 24px));border:1px solid var(--line,#e3e6e8);border-radius:18px;padding:0;background:var(--card,#fff);color:inherit;box-shadow:0 24px 72px rgba(0,0,0,.22)}
#${DIALOG_ID}::backdrop{background:rgba(0,0,0,.48)}
#${DIALOG_ID} .decision-memory-form{display:grid;gap:14px;padding:18px}
#${DIALOG_ID} .decision-memory-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${DIALOG_ID} .decision-memory-title{margin:0;font-size:18px;font-weight:850;line-height:1.2}
#${DIALOG_ID} .decision-memory-item{margin-top:4px;font-size:11px;color:var(--muted,#6b7176)}
#${DIALOG_ID} .decision-memory-close{min-width:38px;min-height:38px;border-radius:10px}
#${DIALOG_ID} label{display:grid;gap:6px;font-size:11px;font-weight:800}
#${DIALOG_ID} textarea,#${DIALOG_ID} input{width:100%;box-sizing:border-box;border:1px solid var(--line,#d8dcdf);border-radius:11px;background:var(--card,#fff);color:inherit;padding:10px 11px;font:inherit}
#${DIALOG_ID} textarea{resize:vertical;min-height:88px}
#${DIALOG_ID} .decision-memory-help,#${DIALOG_ID} .decision-memory-status{font-size:10px;line-height:1.4;color:var(--muted,#6b7176)}
#${DIALOG_ID} .decision-memory-status[data-state="error"]{color:#b42318;font-weight:800}
#${DIALOG_ID} .decision-memory-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
#${DIALOG_ID} .decision-memory-actions button{min-height:40px;border-radius:10px;padding:8px 12px;font-weight:800}
#${DIALOG_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
@media(max-width:980px){#${SHELL_ID} .owner-decision-grid{grid-template-columns:1fr 1fr}#${SHELL_ID} .owner-decision-lane:last-child{grid-column:1/-1}}
@media(max-width:680px){#${SHELL_ID}{padding-bottom:max(18px,env(safe-area-inset-bottom));scroll-margin-bottom:180px}#${SHELL_ID} .owner-decision-head{align-items:center}#${SHELL_ID} .owner-decision-grid{grid-template-columns:1fr}#${SHELL_ID} .owner-decision-lane:last-child{grid-column:auto}#${DIALOG_ID}{margin:auto 12px;width:calc(100vw - 24px)}}
@media(max-width:430px){#${SHELL_ID} .owner-decision-head{display:block}#${SHELL_ID} .owner-decision-head-actions{justify-content:flex-start;margin-top:9px}#${SHELL_ID} .owner-decision-ask{flex:1 1 auto}#${SHELL_ID} .owner-decision-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}#${SHELL_ID} .owner-decision-summary-pill{justify-content:center;padding-inline:5px}#${DIALOG_ID} .decision-memory-actions{display:grid;grid-template-columns:1fr 1fr}#${DIALOG_ID} .decision-memory-actions button{width:100%}}
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
    setDockPrompt(`Explain “${title}” using the current verified business context and any owner-confirmed decision note. Show evidence, risk, and the safest next step. Do not execute anything.`);
  }
  function askThebeQueue(items){
    const top=items.slice().sort((a,b)=>priorityScore(b)-priorityScore(a)).slice(0,5).map(item=>clean(item?.title||item?.label||item?.name)).filter(Boolean);
    const focus=top.length?` Focus first on: ${top.join("; ")}.`:"";
    setDockPrompt(`Brief me on my verified owner-attention queue.${focus} Separate what needs action now, what needs my decision, and what is waiting or blocked. Consider owner-confirmed decision notes as context only, not execution authority. Show evidence and the safest next step for each. Do not execute anything.`);
  }

  function sourceKey(item){
    const direct=clean(item?.key);
    if(direct)return direct.slice(0,300);
    const type=clean(item?.sourceType||item?.kind||"owner_attention");
    const id=clean(item?.sourceId||item?.id||item?.title||"item");
    return `${type}:${id}`.slice(0,300);
  }
  function tinyHash(value){
    let hash=2166136261;
    for(const char of String(value??"")){
      hash^=char.codePointAt(0)||0;
      hash=Math.imul(hash,16777619);
    }
    return (hash>>>0).toString(36);
  }
  function memoryKey(item){
    const source=sourceKey(item);
    const slug=source.toLowerCase().replace(/[^a-z0-9.-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,48)||"item";
    return `decision.${tinyHash(source)}.${slug}`.slice(0,80);
  }
  async function apiJson(url,options){
    if(typeof global.apiJson!=="function")throw new Error("secure_api_unavailable");
    return global.apiJson(url,options);
  }
  async function existingDecision(item){
    const payload=await apiJson("/api/business-memory");
    const key=memoryKey(item);
    const rows=Array.isArray(payload?.items)?payload.items:[];
    const record=rows.find(row=>row?.namespace==="operations"&&row?.key===key&&row?.value?.kind==="owner_decision_note");
    if(record)recordedDecisionKeys.add(sourceKey(item));
    return record?.value||null;
  }
  function ensureDecisionDialog(){
    let dialog=document.getElementById(DIALOG_ID);
    if(dialog)return dialog;
    installStyles();
    dialog=document.createElement("dialog");
    dialog.id=DIALOG_ID;
    dialog.setAttribute("aria-labelledby","ownerDecisionMemoryTitle");
    const form=node("form",undefined,"decision-memory-form");
    form.noValidate=true;
    const head=node("div",undefined,"decision-memory-head");
    const headCopy=node("div");
    const title=node("h3","Record decision","decision-memory-title");
    title.id="ownerDecisionMemoryTitle";
    const itemLabel=node("div","","decision-memory-item");
    itemLabel.id="ownerDecisionMemoryItem";
    headCopy.append(title,itemLabel);
    head.append(headCopy,action("×",()=>closeDecisionDialog(),"btn soft decision-memory-close"));

    const decisionLabel=node("label");
    decisionLabel.append(node("span","Decision"));
    const decision=document.createElement("textarea");
    decision.id="ownerDecisionMemoryText";
    decision.name="decision";
    decision.required=true;
    decision.maxLength=600;
    decision.placeholder="What did you decide?";
    decisionLabel.append(decision);

    const rationaleLabel=node("label");
    rationaleLabel.append(node("span","Why"));
    const rationale=document.createElement("textarea");
    rationale.id="ownerDecisionMemoryRationale";
    rationale.name="rationale";
    rationale.maxLength=1200;
    rationale.placeholder="Reason, trade-off, or evidence considered (optional)";
    rationaleLabel.append(rationale);

    const followLabel=node("label");
    followLabel.append(node("span","Check outcome on"));
    const follow=document.createElement("input");
    follow.id="ownerDecisionMemoryFollowUp";
    follow.type="date";
    follow.name="followUpAt";
    followLabel.append(follow);

    const help=node("div","This saves an owner-confirmed decision note for Thebe’s future context. It does not approve, pay, file, send, or execute anything. Domain records remain authoritative.","decision-memory-help");
    const status=node("div","","decision-memory-status");
    status.id="ownerDecisionMemoryStatus";
    status.setAttribute("role","status");
    const controls=node("div",undefined,"decision-memory-actions");
    controls.append(action("Cancel",()=>closeDecisionDialog(),"btn soft"));
    const save=action("Save decision",()=>{},"btn alt");
    save.id="ownerDecisionMemorySave";
    save.type="submit";
    controls.append(save);
    form.append(head,decisionLabel,rationaleLabel,followLabel,help,status,controls);
    form.addEventListener("submit",event=>{
      event.preventDefault();
      void saveDecisionNote();
    });
    dialog.addEventListener("cancel",event=>{
      event.preventDefault();
      closeDecisionDialog();
    });
    dialog.append(form);
    document.body.append(dialog);
    return dialog;
  }
  function closeDecisionDialog(){
    const dialog=document.getElementById(DIALOG_ID);
    decisionDialogItem=null;
    if(dialog?.open){try{dialog.close()}catch{dialog.removeAttribute("open")}}
  }
  async function openDecisionDialog(item){
    if(!isOwner())return;
    decisionDialogItem=item;
    const dialog=ensureDecisionDialog();
    const title=clean(item?.title||"Owner decision");
    q("#ownerDecisionMemoryItem",dialog).textContent=title;
    const decision=q("#ownerDecisionMemoryText",dialog),rationale=q("#ownerDecisionMemoryRationale",dialog),follow=q("#ownerDecisionMemoryFollowUp",dialog),status=q("#ownerDecisionMemoryStatus",dialog),save=q("#ownerDecisionMemorySave",dialog);
    decision.value="";
    rationale.value="";
    follow.value="";
    status.textContent="Checking for an earlier owner-confirmed note…";
    status.dataset.state="loading";
    save.disabled=true;
    try{dialog.showModal()}catch{dialog.setAttribute("open","")}
    try{
      const existing=await existingDecision(item);
      if(decisionDialogItem!==item)return;
      if(existing){
        decision.value=clean(existing.decision).slice(0,600);
        rationale.value=clean(existing.rationale).slice(0,1200);
        follow.value=/^\d{4}-\d{2}-\d{2}$/.test(String(existing.followUpAt||""))?String(existing.followUpAt):"";
        q("#ownerDecisionMemoryTitle",dialog).textContent="Update decision note";
        status.textContent="Earlier owner-confirmed note loaded. Saving will supersede it and preserve history.";
      }else{
        q("#ownerDecisionMemoryTitle",dialog).textContent="Record decision";
        status.textContent="No earlier note is active for this item.";
      }
      status.dataset.state="ready";
    }catch{
      if(decisionDialogItem!==item)return;
      q("#ownerDecisionMemoryTitle",dialog).textContent="Record decision";
      status.textContent="Existing notes could not be checked. You can still save a new owner-confirmed note.";
      status.dataset.state="error";
    }finally{
      if(decisionDialogItem===item){save.disabled=false;try{decision.focus({preventScroll:true})}catch{decision.focus()}}
    }
  }
  async function saveDecisionNote(){
    const item=decisionDialogItem,dialog=document.getElementById(DIALOG_ID);
    if(!item||!dialog||!isOwner())return;
    const decision=q("#ownerDecisionMemoryText",dialog),rationale=q("#ownerDecisionMemoryRationale",dialog),follow=q("#ownerDecisionMemoryFollowUp",dialog),status=q("#ownerDecisionMemoryStatus",dialog),save=q("#ownerDecisionMemorySave",dialog);
    const decisionText=clean(decision.value).slice(0,600),rationaleText=clean(rationale.value).slice(0,1200),followUpAt=/^\d{4}-\d{2}-\d{2}$/.test(follow.value)?follow.value:null;
    if(decisionText.length<2){status.textContent="Write the decision before saving.";status.dataset.state="error";decision.focus();return}
    save.disabled=true;
    status.textContent="Saving owner-confirmed note…";
    status.dataset.state="loading";
    const key=sourceKey(item);
    try{
      await apiJson("/api/business-memory",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({
          namespace:"operations",
          key:memoryKey(item),
          value:{
            kind:"owner_decision_note",
            version:1,
            sourceKey:key,
            sourceType:clean(item?.sourceType||item?.kind||"owner_attention").slice(0,80),
            sourceId:clean(item?.sourceId||item?.id||"").slice(0,160)||null,
            title:clean(item?.title||item?.label||"Owner decision").slice(0,220),
            decision:decisionText,
            rationale:rationaleText||null,
            followUpAt,
            recordedAt:new Date().toISOString(),
            authority:"context_only_no_execution"
          }
        })
      });
      recordedDecisionKeys.add(key);
      status.textContent="Decision note saved. No action was executed.";
      status.dataset.state="ready";
      const shell=document.getElementById(SHELL_ID);
      if(shell)delete shell.dataset.signature;
      global.setTimeout(()=>{closeDecisionDialog();schedule()},260);
    }catch(error){
      status.textContent=String(error?.message||"").includes("owner_required")?"Only the workspace owner can save decision notes.":"Decision note could not be saved. Nothing was executed.";
      status.dataset.state="error";
      save.disabled=false;
    }
  }

  function dueLabel(item){
    const due=dueAt(item);
    if(due===null)return "";
    if(isOverdue(item))return "Overdue";
    if(isDueSoon(item))return "Due soon";
    return "";
  }
  function itemCard(item,laneKey){
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
    if(recordedDecisionKeys.has(sourceKey(item)))tags.push("Decision saved");
    if(tags.length){
      const meta=node("div");
      meta.className="owner-decision-item-meta";
      tags.slice(0,3).forEach(tag=>meta.append(node("span",tag,"owner-decision-tag")));
      card.append(meta);
    }
    const controls=node("div");
    controls.className="owner-decision-actions";
    if(itemRoute(item))controls.append(action("Review",()=>review(item),"btn soft"));
    if(laneKey==="decision"&&isOwner())controls.append(action(recordedDecisionKeys.has(sourceKey(item))?"Update decision":"Record decision",()=>openDecisionDialog(item),"btn soft"));
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
    items.slice().sort((a,b)=>priorityScore(b)-priorityScore(a)).slice(0,3).forEach(item=>list.append(itemCard(item,key)));
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
      Boolean(item?.blocked),Boolean(item?.waiting),Boolean(item?.requiresApproval),Boolean(item?.requiresOwner),
      recordedDecisionKeys.has(sourceKey(item))
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

  global.ThebeOwnerFirstHome=Object.freeze({release:RELEASE,refresh:schedule,classify,openDecisionDialog});
})(window);
