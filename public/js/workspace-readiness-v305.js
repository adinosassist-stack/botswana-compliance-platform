(()=>{
  "use strict";
  if(typeof window.whenThebeWorkspaceReady==="function")return;
  window.__THEBE_WORKSPACE_READY__=false;
  window.whenThebeWorkspaceReady=function(callback){
    if(typeof callback!=="function")return;
    if(window.__THEBE_WORKSPACE_READY__===true){queueMicrotask(callback);return}
    window.addEventListener("thebe:workspace-ready",callback,{once:true});
  };

  function applyPeopleV306Polish(people){
    if(!people)return;
    const setup=people.querySelector("#opsReportingSetupDetails");
    if(setup&&setup.dataset.v306DefaultCollapse!=="1"){
      setup.removeAttribute("open");
      setup.dataset.v306DefaultCollapse="1";
    }
    const box=people.querySelector("#peopleLocationBars");
    if(!box)return;
    const rows=[...box.querySelectorAll(".people-location-bar")];
    rows.forEach((row,index)=>{row.hidden=index>=4});
    let more=box.querySelector(".people-location-more");
    if(rows.length>4){
      if(!more){
        more=document.createElement("button");
        more.type="button";
        more.className="people-location-more";
        more.addEventListener("click",()=>{if(typeof window.showView==="function")window.showView("dailyreports")});
        box.appendChild(more);
      }
      more.hidden=false;
      const label=`View all ${rows.length} locations →`;
      const ariaLabel=`View all ${rows.length} reporting locations`;
      if(more.textContent!==label)more.textContent=label;
      if(more.getAttribute("aria-label")!==ariaLabel)more.setAttribute("aria-label",ariaLabel);
    }else if(more){
      more.remove();
    }
  }

  function bindPeopleV306Polish(){
    if(typeof document==="undefined")return false;
    const people=document.getElementById("peopleops");
    if(!people)return false;
    applyPeopleV306Polish(people);
    if(people.dataset.v306PeopleObserver!=="1"&&typeof MutationObserver==="function"){
      people.dataset.v306PeopleObserver="1";
      new MutationObserver(()=>applyPeopleV306Polish(people)).observe(people,{childList:true,subtree:true});
    }
    return true;
  }

  function installPeopleV306Polish(){
    if(typeof document==="undefined")return;
    if(bindPeopleV306Polish())return;
    if(typeof MutationObserver!=="function")return;
    const root=document.getElementById("mainContent")||document.body||document.documentElement;
    if(!root)return;
    const wait=new MutationObserver(()=>{if(bindPeopleV306Polish())wait.disconnect()});
    wait.observe(root,{childList:true,subtree:true});
  }

  window.whenThebeWorkspaceReady(installPeopleV306Polish);
})();

(()=>{
  "use strict";
  const release="20261010-property-construction-v311";
  let requested=false;
  function loadPropertyConstruction(){
    if(requested)return;
    requested=true;
    import(`/js/property-construction-v311.js?release=${release}`).catch(error=>{
      requested=false;
      console.error("Property construction extension failed to load",error);
    });
  }
  if(typeof window.whenThebeWorkspaceReady==="function")window.whenThebeWorkspaceReady(loadPropertyConstruction);
  else if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",loadPropertyConstruction,{once:true});
  else loadPropertyConstruction();
})();
