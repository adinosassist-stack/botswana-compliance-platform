(()=>{
  "use strict";
  if(typeof window.whenThebeWorkspaceReady==="function")return;
  window.__THEBE_WORKSPACE_READY__=false;

  // Cold-start landing navigation must not synchronously run secondary workspace
  // listeners before the authenticated shell has committed authored readiness.
  // Preserve normal navigation semantics once ready and coalesce any pre-ready
  // landing changes to the latest view.
  const nativeWorkspaceDispatch=window.dispatchEvent.bind(window);
  let deferredWorkspaceViewChange=null;
  let deferredWorkspaceViewFlushScheduled=false;
  const scheduleDeferredWorkspaceViewChange=()=>{
    if(deferredWorkspaceViewFlushScheduled||window.__THEBE_WORKSPACE_READY__!==true||!deferredWorkspaceViewChange)return;
    deferredWorkspaceViewFlushScheduled=true;
    const flush=()=>{
      deferredWorkspaceViewFlushScheduled=false;
      if(window.__THEBE_WORKSPACE_READY__!==true||!deferredWorkspaceViewChange)return;
      const event=deferredWorkspaceViewChange;
      deferredWorkspaceViewChange=null;
      nativeWorkspaceDispatch(event);
    };
    const afterPaint=()=>setTimeout(flush,0);
    if(typeof requestAnimationFrame==="function")requestAnimationFrame(afterPaint);
    else setTimeout(flush,0);
  };
  window.dispatchEvent=function(event){
    if(event?.type==="thebe:workspace-view-change"&&window.__THEBE_WORKSPACE_READY__!==true){
      deferredWorkspaceViewChange=event;
      return true;
    }
    const result=nativeWorkspaceDispatch(event);
    if(event?.type==="thebe:workspace-ready"&&window.__THEBE_WORKSPACE_READY__===true)scheduleDeferredWorkspaceViewChange();
    return result;
  };

  window.whenThebeWorkspaceReady=function(callback){
    if(typeof callback!=="function")return;
    if(window.__THEBE_WORKSPACE_READY__===true){queueMicrotask(callback);return}
    window.addEventListener("thebe:workspace-ready",callback,{once:true});
  };

  function applyPeopleV306Polish(people){
    if(!people)return;
    const setup=people.querySelector("#opsReportingSetupDetails");
    if(setup&&setup.dataset.v306DefaultCollapse!=="1"){
      if(people.dataset.v337ReportingOpen==="1")setup.open=true;
      else setup.removeAttribute("open");
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

  function installPeopleDeferredReporting(people){
    if(!people)return false;
    // Wrap the canonical renderer only once, but bind each new disclosure node.
    // Lazy workspace hydration can replace the <details> element after this hook ran.
    if(people.dataset.v337DeferredReporting!=="1"){
      const original=window.renderPeopleReportingSetup;
      if(typeof original!=="function")return false;
      window.renderPeopleReportingSetup=async function(...args){
        const root=document.getElementById("peopleops");
        if(!root?.classList.contains("active"))return;
        const panel=root.querySelector("#opsReportingSetupDetails");
        if(panel&&!panel.open)return;
        return original.apply(this,args);
      };
      people.dataset.v337DeferredReporting="1";
    }
    const details=people.querySelector("#opsReportingSetupDetails");
    if(!details)return false;
    if(details.dataset.v337DeferredReportingToggle!=="1"){
      details.dataset.v337DeferredReportingToggle="1";
      details.addEventListener("toggle",()=>{
        people.dataset.v337ReportingOpen=details.open?"1":"0";
        if(details.open)void window.renderPeopleReportingSetup();
      });
    }
    return true;
  }

  function bindPeopleV306Polish(){
    if(typeof document==="undefined")return false;
    const people=document.getElementById("peopleops");
    if(!people)return false;
    applyPeopleV306Polish(people);
    const reportingReady=installPeopleDeferredReporting(people);
    if(people.dataset.v306PeopleObserver!=="1"&&typeof MutationObserver==="function"){
      people.dataset.v306PeopleObserver="1";
      new MutationObserver(()=>{
        applyPeopleV306Polish(people);
        // Reattach to lazily replaced People panels: do not leave Add location unhydrated.
        installPeopleDeferredReporting(people);
      }).observe(people,{childList:true,subtree:true});
    }
    return reportingReady;
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
  const renderRelease="20261011-owner-ask-render-v321";
  const controlRelease="20261011-owner-ask-control-v320";
  let requested=false;
  function loadOwnerAsk(){
    if(requested)return;
    requested=true;
    import(`/js/owner-ask-thebe-render-v321.js?release=${renderRelease}`)
      .then(()=>import(`/js/owner-ask-thebe-stable-v320.js?release=${controlRelease}`))
      .catch(error=>{
        requested=false;
        console.error("Owner Ask Thebe extensions failed to load",error);
      });
  }
  if(typeof window.whenThebeWorkspaceReady==="function")window.whenThebeWorkspaceReady(loadOwnerAsk);
  else if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",loadOwnerAsk,{once:true});
  else loadOwnerAsk();
})();

(()=>{
  "use strict";
  const baseRelease="20261010-property-construction-v311";
  const workflowRelease="20261010-property-construction-workflow-v312";
  let requested=false;
  function loadPropertyConstruction(){
    if(requested)return;
    requested=true;
    import(`/js/property-construction-v311.js?release=${baseRelease}`)
      .then(()=>import(`/js/property-construction-workflow-v312.js?release=${workflowRelease}`))
      .catch(error=>{
        requested=false;
        console.error("Property construction extension failed to load",error);
      });
  }
  function loadPropertyWhenVisible(){
    if(typeof document==="undefined")return;
    if(document.getElementById("propertyintelligence")?.classList.contains("active")||
       document.getElementById("industryintel")?.classList.contains("active"))loadPropertyConstruction();
  }
  window.addEventListener("thebe:workspace-view-change",event=>{
    if(["propertyintelligence","industryintel"].includes(String(event.detail?.id||"")))loadPropertyConstruction();
  });
  if(typeof window.whenThebeWorkspaceReady==="function")window.whenThebeWorkspaceReady(loadPropertyWhenVisible);
  else if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",loadPropertyWhenVisible,{once:true});
  else loadPropertyWhenVisible();
})();

(()=>{
  "use strict";
  const release="20261011-report-money-v331";
  let requested=false;
  function loadReportMoney(){
    if(requested)return;
    requested=true;
    import(`/js/daily-report-money-v331.js?release=${release}`).catch(error=>{
      requested=false;
      console.error("Daily report money extension failed to load",error);
    });
  }
  if(typeof window.whenThebeWorkspaceReady==="function")window.whenThebeWorkspaceReady(loadReportMoney);
  else if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",loadReportMoney,{once:true});
  else loadReportMoney();
})();

(()=>{
  "use strict";
  const release="20261013-locations-branches-v335";
  let requested=false;
  function loadLocationsBranches(){
    if(requested)return;
    requested=true;
    import(`/js/locations-branches-v335.js?release=${release}`).catch(error=>{
      requested=false;
      console.error("Locations & Branches extension failed to load",error);
    });
  }
  if(typeof window.whenThebeWorkspaceReady==="function")window.whenThebeWorkspaceReady(loadLocationsBranches);
  else if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",loadLocationsBranches,{once:true});
  else loadLocationsBranches();
})();

(()=>{
  "use strict";
  const STYLE_ID="thebe-workspace-visual-consistency-v319";
  function loadVisualConsistency(){
    if(typeof document==="undefined"||document.getElementById(STYLE_ID))return;
    const link=document.createElement("link");
    link.id=STYLE_ID;
    link.rel="stylesheet";
    link.href="/assets/workspace-visual-consistency-v319.css?v=20261015a";
    link.dataset.workspaceOnly="true";
    (document.head||document.documentElement).appendChild(link);
  }
  loadVisualConsistency();
})();

(()=>{
  "use strict";
  const release="20261015-context-starters-v336";
  let requested=false;
  function loadContextStarters(){
    if(requested)return;
    requested=true;
    import(`/js/thebe-context-starters-v336.js?release=${release}`).catch(error=>{
      requested=false;
      console.error("Thebe contextual starter actions failed to load",error);
    });
  }
  if(typeof window.whenThebeWorkspaceReady==="function")window.whenThebeWorkspaceReady(loadContextStarters);
  else if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",loadContextStarters,{once:true});
  else loadContextStarters();
})();

(()=>{
  "use strict";
  const SHARD_COUNT=12;
  const SHARD_PREFIX="/assets/workspace-view-fragments-20261001a-";
  const SHARD_ORDER=Object.freeze([1,4,10,9,2,8,0,6,3,5,7,11]);
  let scheduled=false;

  function networkAllowsWarmup(){
    const connection=window.navigator?.connection;
    if(connection?.saveData===true)return false;
    const effectiveType=String(connection?.effectiveType||"").toLowerCase();
    return effectiveType!=="slow-2g"&&effectiveType!=="2g";
  }

  function workspaceShardUrl(shard){
    if(!window.location?.origin||!window.document)return "";
    const index=Number(shard);
    if(!Number.isInteger(index)||index<0||index>=SHARD_COUNT)return "";
    const url=new URL(`${SHARD_PREFIX}${index}.json`,window.location.origin);
    const assetRelease=String(window.document.querySelector('meta[name="thebe-assets-release"]')?.content||"");
    if(/^[0-9a-f]{40}$/.test(assetRelease))url.searchParams.set("release",assetRelease);
    return url.pathname+url.search;
  }

  async function warmWorkspaceFragments(){
    const createClient=window.BW?.api?.createClient;
    if(scheduled||!networkAllowsWarmup()||typeof createClient!=="function")return;
    scheduled=true;
    const client=createClient({timeoutMs:6000,retries:0});
    for(const shard of SHARD_ORDER.slice(0,3)){
      const url=workspaceShardUrl(shard);
      if(!url)continue;
      try{
        if(typeof window.prefetchThebeWorkspaceShard==="function")await window.prefetchThebeWorkspaceShard(shard);
        else await client.request(url,{method:"GET"});
      }catch(_){/* Prefetch is opportunistic; normal bounded hydration remains authoritative. */}
      await new Promise(resolve=>window.setTimeout(resolve,25));
    }
  }

  function scheduleWorkspaceFragmentWarmup(){
    if(scheduled||!networkAllowsWarmup())return;
    if(typeof window.requestIdleCallback==="function"){
      window.requestIdleCallback(()=>void warmWorkspaceFragments(),{timeout:1200});
      return;
    }
    if(typeof window.setTimeout==="function")window.setTimeout(()=>void warmWorkspaceFragments(),350);
  }

  // Only warm a destination the user is actually moving toward, and share
  // its in-flight request with showView rather than downloading it twice.
  const prefetchedIntentViews=new Set();
  function prefetchOnNavigationIntent(event){
    if(!networkAllowsWarmup()||window.__THEBE_WORKSPACE_READY__!==true)return;
    const button=event.target?.closest?.("[data-view]");
    const id=String(button?.dataset?.view||"");
    if(!id||document.getElementById(id)?.dataset?.lazyView!=="1")return;
    if(prefetchedIntentViews.has(id)||typeof window.prefetchThebeWorkspaceView!=="function")return;
    prefetchedIntentViews.add(id);
    try{
      Promise.resolve(window.prefetchThebeWorkspaceView(id)).catch(()=>{
        // Allow another intent to retry after a failed speculative fetch.
        prefetchedIntentViews.delete(id);
      });
    }catch(_){prefetchedIntentViews.delete(id);}
  }
  function bindWorkspacePrefetch(){
    if(typeof document==="undefined")return;
    document.addEventListener("pointerover",prefetchOnNavigationIntent,{passive:true});
    document.addEventListener("focusin",prefetchOnNavigationIntent);
    document.addEventListener("touchstart",prefetchOnNavigationIntent,{passive:true});
  }
  if(typeof window.whenThebeWorkspaceReady==="function"){
    window.whenThebeWorkspaceReady(bindWorkspacePrefetch);
    window.whenThebeWorkspaceReady(scheduleWorkspaceFragmentWarmup);
  }
})();
