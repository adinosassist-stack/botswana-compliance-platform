(function ownerJourneyBootstrap(global){
  "use strict";
  function deriveOwnerJourney(user, payload){
    if(!user||user.role!=="owner"||!user.id||!user.tenantId)return null;
    const root=payload?.state;
    const companies=Array.isArray(root?.companies)?root.companies:[];
    const company=companies.find(item=>item?.id&&item.id===root?.activeCompanyId);
    const profile=company?.profile||{};
    const account=true;
    const business=!!company&&!!String(profile.entityType||"").trim()&&!!String(profile.industry||"").trim()&&
      Number.isInteger(Number(profile.employees))&&Number(profile.employees)>=0;
    const workspace=!!company;
    const onboardingComplete=user.onboardingComplete===true;
    const checkedAt=typeof profile.firstProtectionCheckAt==="string"?Date.parse(profile.firstProtectionCheckAt):NaN;
    const first=workspace&&business&&onboardingComplete&&profile.firstProtectionCheckStatus==="complete"&&Number.isFinite(checkedAt);
    return Object.freeze({account,business,workspace,first,onboardingComplete,emailVerified:user.emailVerified===true?true:null});
  }
  if(typeof module!=="undefined"&&module.exports){module.exports={deriveOwnerJourney};return}
  const doc=global.document;
  if(!doc||!global.BW?.api?.createClient)return;
  // Build trusted, fixed UI with DOM APIs; never parse HTML strings.
  function make(tag,{id="",className="",text="",style="",attrs={}}={}){
    const node=doc.createElement(tag);
    if(id)node.id=id;
    if(className)node.className=className;
    if(text)node.textContent=text;
    if(style)node.style.cssText=style;
    for(const [name,value] of Object.entries(attrs))node.setAttribute(name,value);
    return node;
  }
  const anchor=doc.getElementById("welcomeSetupBanner");
  if(anchor&&!doc.getElementById("ownerJourney")){
    const panel=make("section",{id:"ownerJourney",className:"card",style:"display:none;max-width:100%;margin:0 0 18px",attrs:{"aria-labelledby":"ownerJourneyTitle"}});
    panel.hidden=true;
    const header=make("div",{className:"between row",style:"align-items:flex-start;gap:12px;flex-wrap:wrap"});
    const copy=make("div",{style:"min-width:0"});
    copy.append(make("div",{className:"section-eyebrow",text:"Getting started"}),
      make("h2",{id:"ownerJourneyTitle",text:"Your four setup milestones"}),
      make("p",{className:"muted small",text:"Confirmed from your signed-in workspace. A saved check is not a legal compliance conclusion."}));
    header.append(copy);
    const refresh=make("button",{id:"ownerJourneyRefresh",className:"btn soft",text:"Refresh progress",style:"min-height:44px"});
    refresh.type="button";
    header.append(refresh);
    panel.append(header,make("p",{id:"ownerJourneySummary",text:"Checking your saved progress…",attrs:{role:"status","aria-live":"polite"}}));
    const list=make("ol",{id:"ownerJourneySteps",style:"display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px;padding:0;margin:12px 0 0;list-style:none"});
    const milestones=[
      ["account","1. Account access","ownerJourneyAccount","Signed-in access is confirmed separately from email verification.",null,null],
      ["business","2. Business details","ownerJourneyBusiness","Your legal entity, industry and employee count must be saved.","ownerJourneyBusinessAction","Complete basics"],
      ["workspace","3. Workspace selection","ownerJourneyWorkspace","Select a company in your authenticated workspace.","ownerJourneyWorkspaceAction","Choose company"],
      ["first","4. First saved check","ownerJourneyFirst","Ready only after the server confirms the saved result.","ownerJourneyFirstAction","Run first check"]
    ];
    for(const [key,title,statusId,description,actionId,actionText] of milestones){
      const item=make("li",{style:"min-width:0;padding:12px;border:1px solid var(--line);border-radius:12px",attrs:{"data-onboarding-milestone":key}});
      item.append(make("b",{text:title}),make("div",{id:statusId,className:"small",text:"Not checked"}),make("p",{className:"muted small",text:description}));
      if(actionId){
        const action=make("button",{id:actionId,className:"btn soft",text:actionText,style:"display:none;min-height:44px"});
        action.type="button";
        action.hidden=true;
        item.append(action);
      }
      list.append(item);
    }
    panel.append(list);
    anchor.parentNode.insertBefore(panel,anchor);
  }
  const panel=doc.getElementById("ownerJourney");
  if(!panel)return;
  // Non-issuing first-document guidance. The quotation service remains separately gated.
  const guide=make("section",{id:"ownerFirstDocumentGuide",style:"margin-top:14px;border-top:1px solid var(--line);padding-top:14px",attrs:{"aria-labelledby":"ownerFirstDocumentTitle"}});
  guide.hidden=true;
  guide.append(make("h3",{id:"ownerFirstDocumentTitle",text:"Prepare your first business document"}),
    make("p",{className:"muted small",text:"Practice the steps before using a separately enabled quotation or invoice editor. No record, payment or PDF is created here."}));
  const guideActions=make("div",{className:"row",style:"display:flex;gap:10px;flex-wrap:wrap"});
  const quotation=make("button",{id:"ownerGuideQuotation",className:"btn soft",text:"Quotation guide",style:"min-height:44px"});
  const invoice=make("button",{id:"ownerGuideInvoice",className:"btn soft",text:"Invoice guide",style:"min-height:44px"});
  quotation.type="button";invoice.type="button";
  guideActions.append(quotation,invoice);
  const guideSteps=make("ol",{id:"ownerFirstDocumentSteps",style:"padding-left:24px;margin:10px 0",attrs:{"aria-label":"First document preparation checklist"}});
  const guideStatus=make("p",{id:"ownerFirstDocumentStatus",className:"muted small",attrs:{role:"status","aria-live":"polite"}});
  guide.append(guideActions,guideSteps,guideStatus);
  panel.append(guide);
  const guideCopy=Object.freeze({
    quotation:["Confirm the intended customer and their contact details without using real customer information in a demo.","Prepare item descriptions, quantities, unit prices and any discounts in Botswana pula.","Use an authorized draft editor only when available; separately verify its saved result and PDF preview before sharing."],
    invoice:["Confirm the customer, seller and agreed work or goods; keep demo content clearly marked.","Prepare itemized amounts, invoice date, payment terms and Botswana pula totals.","Issue or send an invoice only through an authorized workflow; never assume a draft or payment reference proves settlement."]
  });
  function showGuide(kind){
    if(guide.hidden||!Object.prototype.hasOwnProperty.call(guideCopy,kind))return;
    guideSteps.replaceChildren();
    for(const step of guideCopy[kind])guideSteps.append(make("li",{text:step}));
    quotation.setAttribute("aria-pressed",String(kind==="quotation"));
    invoice.setAttribute("aria-pressed",String(kind==="invoice"));
    guideStatus.textContent="Preparation only — no draft was saved, preview generated or document issued.";
  }
  quotation.addEventListener("click",()=>showGuide("quotation"));
  invoice.addEventListener("click",()=>showGuide("invoice"));
  const client=global.BW.api.createClient({retries:0});
  const el=id=>doc.getElementById(id);
  const ids=["ownerJourneyAccount","ownerJourneyBusiness","ownerJourneyWorkspace","ownerJourneyFirst"];
  const controls=["ownerJourneyBusinessAction","ownerJourneyWorkspaceAction","ownerJourneyFirstAction"];
  let inFlight=false,last=null;

  function showPanel(visible){
    panel.hidden=!visible;
    panel.style.display=visible?"block":"none";
    if(!visible)guide.hidden=true;
  }
  function button(id,visible){
    const control=el(id);
    if(!control)return;
    control.hidden=!visible;
    control.style.display=visible?"inline-flex":"none";
  }
  function unknown(){
    for(const id of ids){const target=el(id);if(target)target.textContent="Not verified"}
    for(const id of controls)button(id,false);
  }
  function render(model){
    last=model;
    showPanel(true);
    guide.hidden=!(model.account&&model.business&&model.workspace);
    const [account,business,workspace,first]=ids.map(el);
    if(account)account.textContent="Signed-in owner session confirmed";
    if(business)business.textContent=model.business?"Business basics saved":"Business basics incomplete";
    if(workspace)workspace.textContent=model.workspace?"Company selected":"No selected company confirmed";
    if(first)first.textContent=model.first?"Saved first check confirmed":"First saved check pending";
    button("ownerJourneyBusinessAction",!model.business);
    button("ownerJourneyWorkspaceAction",!model.workspace);
    button("ownerJourneyFirstAction",model.workspace&&model.business&&model.onboardingComplete&&!model.first);
    const done=[model.account,model.business,model.workspace,model.first].filter(Boolean).length;
    const summary=el("ownerJourneySummary");
    if(summary)summary.textContent=done+" of 4 setup milestones confirmed. Email verification is not inferred from the sign-in session.";
  }
  async function refresh(){
    if(inFlight||doc.body?.classList.contains("standalone-preview"))return;
    inFlight=true;
    const refreshButton=el("ownerJourneyRefresh");
    if(refreshButton)refreshButton.disabled=true;
    try{
      const info=await client.request("/api/auth/me",{method:"GET"});
      if(!info?.user||info.user.role!=="owner"){last=null;showPanel(false);return}
      showPanel(true);
      unknown();
      const summary=el("ownerJourneySummary");
      if(summary)summary.textContent="Checking your server-saved progress…";
      const data=await client.request("/api/state",{method:"GET"});
      const model=deriveOwnerJourney(info.user,data);
      if(!model){last=null;showPanel(false);return}
      render(model);
    }catch(error){
      last=null;
      if(error?.status===401||error?.status===403){showPanel(false);return}
      if(!panel.hidden){
        unknown();
        const summary=el("ownerJourneySummary");
        if(summary)summary.textContent="Progress could not be verified. Refresh to try again; no step is marked complete.";
      }
    }finally{
      inFlight=false;
      if(refreshButton)refreshButton.disabled=false;
    }
  }
  el("ownerJourneyRefresh")?.addEventListener("click",()=>void refresh());
  el("ownerJourneyBusinessAction")?.addEventListener("click",()=>{
    if(last&&!last.business&&typeof global.openOnboarding==="function")global.openOnboarding();
  });
  el("ownerJourneyWorkspaceAction")?.addEventListener("click",()=>{
    if(last&&!last.workspace)el("companySelect")?.focus();
  });
  el("ownerJourneyFirstAction")?.addEventListener("click",async()=>{
    if(!last?.workspace||!last.business||!last.onboardingComplete||last.first)return;
    if(typeof global.runFirstProtectionCheck!=="function")return;
    await global.runFirstProtectionCheck();
    await refresh();
  });
  if(typeof global.whenThebeWorkspaceReady==="function")global.whenThebeWorkspaceReady(()=>void refresh());
  else global.addEventListener?.("thebe:workspace-ready",()=>void refresh(),{once:true});
  const onboard=el("onboardModal");
  if(onboard&&global.MutationObserver)new global.MutationObserver(()=>{
    if(!onboard.classList.contains("open"))void refresh();
  }).observe(onboard,{attributes:true,attributeFilter:["class"]});
  const firstStatus=el("firstValueStatus");
  if(firstStatus&&global.MutationObserver)new global.MutationObserver(()=>void refresh()).observe(firstStatus,{childList:true,characterData:true,subtree:true});
  global.addEventListener?.("focus",()=>{if(!panel.hidden)void refresh()});
})(window);
