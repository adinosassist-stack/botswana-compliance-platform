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
  const panel=doc.getElementById("ownerJourney");
  if(!panel)return;
  const client=global.BW.api.createClient({retries:0});
  const el=id=>doc.getElementById(id);
  const ids=["ownerJourneyAccount","ownerJourneyBusiness","ownerJourneyWorkspace","ownerJourneyFirst"];
  const controls=["ownerJourneyBusinessAction","ownerJourneyWorkspaceAction","ownerJourneyFirstAction"];
  let inFlight=false,last=null;

  function showPanel(visible){
    panel.hidden=!visible;
    panel.style.display=visible?"block":"none";
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
