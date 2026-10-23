(()=>{
  "use strict";

  const RELEASE="20261013-locations-branches-v335";
  // Observe only the views that use Locations & Branches, never every DOM change in the workspace.
  const sectionObservers=new Map();
  let onboardingObserver=null;
  let decorateQueued=false;
  let onboardingYieldQueued=false;
  let onboardingYieldInFlight=false;

  function make(tag,className,text){
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(text!==undefined)el.textContent=String(text);
    return el;
  }

  function peopleIsActive(){
    const people=document.getElementById("peopleops");
    if(!people||!people.classList.contains("active"))return false;
    if(people.hidden||people.getAttribute("aria-hidden")==="true")return false;
    return true;
  }

  function yieldOnboardingForPeople(){
    onboardingYieldQueued=false;
    if(onboardingYieldInFlight||!peopleIsActive())return;
    const modal=document.getElementById("onboardModal");
    if(!modal||!modal.classList.contains("open"))return;
    const dismiss=window.dismissOnboarding;
    if(typeof dismiss!=="function"){
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden","true");
      return;
    }
    onboardingYieldInFlight=true;
    try{
      const result=dismiss();
      if(result&&typeof result.then==="function"){
        result.catch(error=>console.error("People onboarding yield failed",error)).finally(()=>{onboardingYieldInFlight=false});
      }else{
        onboardingYieldInFlight=false;
      }
    }catch(error){
      onboardingYieldInFlight=false;
      console.error("People onboarding yield failed",error);
    }
  }

  function scheduleOnboardingYield(){
    if(onboardingYieldQueued)return;
    onboardingYieldQueued=true;
    queueMicrotask(yieldOnboardingForPeople);
  }

  function scheduleDecorate(){
    if(decorateQueued)return;
    decorateQueued=true;
    queueMicrotask(()=>{
      decorateQueued=false;
      decorateWorkspace();
    });
  }

  function setSetupLabel(setup){
    const summary=setup?.querySelector("summary");
    if(!summary||summary.dataset.locationsBranchesLabel==="1")return;
    summary.textContent="Locations & Branches · reporting setup";
    summary.dataset.locationsBranchesLabel="1";
  }

  function bindAddLocationAction(people){
    const button=people?.querySelector('[data-bw-onclick="addOpsLocation()"]');
    if(!button||button.dataset.locationsBranchesAddBound==="1")return;
    button.type="button";
    button.dataset.locationsBranchesAddBound="1";
    button.addEventListener("click",async event=>{
      if(button.disabled||button.dataset.locationsBranchesSaving==="1")return;
      const action=window.addOpsLocation;
      if(typeof action!=="function")return;
      event.preventDefault();
      event.stopPropagation();
      button.dataset.locationsBranchesSaving="1";
      const wasDisabled=button.disabled;
      button.disabled=true;
      button.setAttribute("aria-busy","true");
      try{
        await action();
      }catch(error){
        // Preserve the entered values and surface failures without reopening the form.
        console.error("Add location failed",error);
        const status=people.querySelector("#opsLocationStatus");
        // The canonical addOpsLocation handler owns actionable validation messages.
        if(status&&!status.textContent.trim()){
          status.textContent="Could not add location. Please retry.";
          status.dataset.state="error";
          status.setAttribute("role","alert");
        }
      }finally{
        button.disabled=wasDisabled;
        button.removeAttribute("aria-busy");
        delete button.dataset.locationsBranchesSaving;
      }
    },true);
  }

  function decorateLocationForm(people,setup){
    const nameInput=people?.querySelector("#opsLocationName");
    if(!nameInput)return;
    const block=nameInput.closest(".card")||nameInput.closest(".stack")?.parentElement||setup;
    if(block&&!block.querySelector("#locationsBranchesHeading")){
      const heading=make("div","locations-branches-heading");
      heading.id="locationsBranchesHeading";
      const eyebrow=make("div","section-eyebrow","Organisation");
      const title=make("h2","","Locations & Branches");
      const copy=make("div","muted small","Add offices, branches, shops, sites or teams once, then use those locations across People and daily reporting.");
      heading.append(eyebrow,title,copy);
      block.insertBefore(heading,block.firstChild);
    }

    if(!nameInput.placeholder)nameInput.placeholder="e.g. Gaborone Head Office";
    const code=people.querySelector("#opsLocationCode");
    if(code&&!code.placeholder)code.placeholder="e.g. GAB-HQ";
    const town=people.querySelector("#opsLocationTown");
    if(town&&!town.placeholder)town.placeholder="e.g. Gaborone";
    bindAddLocationAction(people);
  }

  function addPeopleShortcut(people){
    if(!people||people.querySelector("[data-locations-branches-shortcut='people']"))return;
    const hero=people.querySelector(".hub-hero");
    if(!hero)return;
    const button=make("button","btn alt","Locations & Branches");
    button.type="button";
    button.dataset.locationsBranchesShortcut="people";
    button.setAttribute("aria-label","Manage organisation locations and branches");
    button.addEventListener("click",openLocationsBranches);
    hero.appendChild(button);
  }

  function decoratePeople(){
    const people=document.getElementById("peopleops");
    if(!people)return;
    addPeopleShortcut(people);
    const setup=people.querySelector("#opsReportingSetupDetails");
    if(!setup)return;
    setup.dataset.organisationLocations="1";
    setSetupLabel(setup);
    decorateLocationForm(people,setup);
  }

  function settingsLocationCard(){
    const button=make("button","outcome-card");
    button.type="button";
    button.dataset.locationsBranchesShortcut="settings";
    button.setAttribute("aria-label","Open Locations & Branches");
    button.append(
      make("span","section-eyebrow","Organisation"),
      make("b","","Locations & Branches"),
      make("span","outcome-card-status","Manage offices, branches, shops, sites and teams used across the workspace."),
      make("span","outcome-card-action","Manage locations →")
    );
    button.addEventListener("click",openLocationsBranches);
    return button;
  }

  function decorateSettings(){
    const settings=document.getElementById("accounthub");
    if(!settings||settings.querySelector("[data-locations-branches-shortcut='settings']"))return;
    const grid=settings.querySelector(".outcome-grid");
    if(!grid)return;
    grid.appendChild(settingsLocationCard());
  }

  function revealLocations(){
    scheduleOnboardingYield();
    decoratePeople();
    const people=document.getElementById("peopleops");
    const setup=people?.querySelector("#opsReportingSetupDetails");
    const target=people?.querySelector("#locationsBranchesHeading")||people?.querySelector("#opsLocationName")||setup;
    if(!setup||!target)return false;
    setup.open=true;
    target.scrollIntoView?.({behavior:"smooth",block:"start"});
    const input=people.querySelector("#opsLocationName");
    if(input)setTimeout(()=>input.focus({preventScroll:true}),220);
    return true;
  }

  function openLocationsBranches(){
    if(typeof window.showView==="function")window.showView("peopleops");
    scheduleOnboardingYield();
    let attempts=0;
    const retry=()=>{
      scheduleOnboardingYield();
      if(revealLocations())return;
      attempts+=1;
      if(attempts<30)setTimeout(retry,80);
    };
    setTimeout(retry,0);
  }

  function decorateWorkspace(){
    decoratePeople();
    decorateSettings();
    scheduleOnboardingYield();
  }

  function bindOnboardingObserver(){
    const modal=document.getElementById("onboardModal");
    if(!modal||onboardingObserver||typeof MutationObserver!=="function")return;
    onboardingObserver=new MutationObserver(scheduleOnboardingYield);
    onboardingObserver.observe(modal,{attributes:true,attributeFilter:["class","aria-hidden"]});
  }

  function bindSectionObservers(){
    if(typeof MutationObserver!=="function")return;
    for(const id of ["peopleops","accounthub"]){
      const root=document.getElementById(id);
      const current=sectionObservers.get(id);
      if(current?.root===root)continue;
      current?.observer.disconnect();
      sectionObservers.delete(id);
      if(!root)continue;
      const observer=new MutationObserver(()=>{
        scheduleDecorate();
        if(id==="peopleops")scheduleOnboardingYield();
      });
      observer.observe(root,{childList:true,subtree:true});
      sectionObservers.set(id,{root,observer});
    }
  }

  function install(){
    if(typeof document==="undefined")return;
    window.openLocationsBranches=openLocationsBranches;
    decorateWorkspace();
    bindOnboardingObserver();
    document.addEventListener("click",event=>{
      const target=event.target?.closest?.('[data-view="peopleops"],[data-locations-branches-shortcut]');
      if(!target)return;
      [0,80,240,800,1600].forEach(delay=>setTimeout(scheduleOnboardingYield,delay));
    },true);
    bindSectionObservers();
    window.addEventListener("thebe:workspace-view-change",event=>{
      const id=String(event?.detail?.id||"");
      if(id!=="peopleops"&&id!=="accounthub")return;
      bindSectionObservers();
      scheduleDecorate();
      if(id==="peopleops")scheduleOnboardingYield();
    });
    document.documentElement.dataset.locationsBranchesRelease=RELEASE;
  }

  if(typeof window.whenThebeWorkspaceReady==="function")window.whenThebeWorkspaceReady(install);
  else if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})();
