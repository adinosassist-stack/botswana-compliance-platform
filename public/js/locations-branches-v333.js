(()=>{
  "use strict";

  const RELEASE="20261013-locations-branches-v333";
  let observer=null;
  let decorateQueued=false;

  function make(tag,className,text){
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(text!==undefined)el.textContent=String(text);
    return el;
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

  function decorateLocationForm(people,setup){
    const nameInput=people?.querySelector("#opsLocationName");
    if(!nameInput)return;
    const block=nameInput.closest(".card")||nameInput.closest(".stack")?.parentElement||setup;
    if(!block||block.querySelector("#locationsBranchesHeading"))return;

    const heading=make("div","locations-branches-heading");
    heading.id="locationsBranchesHeading";
    const eyebrow=make("div","section-eyebrow","Organisation");
    const title=make("h2","","Locations & Branches");
    const copy=make("div","muted small","Add offices, branches, shops, sites or teams once, then use those locations across People and daily reporting.");
    heading.append(eyebrow,title,copy);
    block.insertBefore(heading,block.firstChild);

    if(!nameInput.placeholder)nameInput.placeholder="e.g. Gaborone Head Office";
    const code=people.querySelector("#opsLocationCode");
    if(code&&!code.placeholder)code.placeholder="e.g. GAB-HQ";
    const town=people.querySelector("#opsLocationTown");
    if(town&&!town.placeholder)town.placeholder="e.g. Gaborone";
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
    let attempts=0;
    const retry=()=>{
      if(revealLocations())return;
      attempts+=1;
      if(attempts<30)setTimeout(retry,80);
    };
    setTimeout(retry,0);
  }

  function decorateWorkspace(){
    decoratePeople();
    decorateSettings();
  }

  function install(){
    if(typeof document==="undefined")return;
    window.openLocationsBranches=openLocationsBranches;
    decorateWorkspace();
    if(observer||typeof MutationObserver!=="function")return;
    const root=document.getElementById("mainContent")||document.body||document.documentElement;
    if(!root)return;
    observer=new MutationObserver(scheduleDecorate);
    observer.observe(root,{childList:true,subtree:true});
    document.documentElement.dataset.locationsBranchesRelease=RELEASE;
  }

  if(typeof window.whenThebeWorkspaceReady==="function")window.whenThebeWorkspaceReady(install);
  else if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})();
