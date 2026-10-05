(function installWorkspacePropertyRouteIsolation(global){
  "use strict";

  const RELEASE="20261004-property-route-isolation-v277";
  const PROPERTY_VIEW_ID="propertyintelligence";
  let observer=null;
  let scheduled=false;
  let reconciling=false;

  function propertyView(){
    return document.getElementById(PROPERTY_VIEW_ID);
  }

  function propertyIsActive(view){
    if(!view||!view.classList.contains("active"))return false;
    const active=document.querySelector(".view.active");
    return active===view;
  }

  function isolateInactiveProperty(view){
    let changed=false;
    if(view.style.getPropertyValue("display")!=="none"||view.style.getPropertyPriority("display")!=="important"){
      view.style.setProperty("display","none","important");
      changed=true;
    }
    if(view.getAttribute("aria-hidden")!=="true"){
      view.setAttribute("aria-hidden","true");
      changed=true;
    }
    if(!view.hasAttribute("inert")){
      view.setAttribute("inert","");
      changed=true;
    }
    if(view.dataset.propertyRouteIsolation!==RELEASE){
      view.dataset.propertyRouteIsolation=RELEASE;
      changed=true;
    }
    return changed;
  }

  function releaseActiveProperty(view){
    if(view.dataset.propertyRouteIsolation!==RELEASE)return false;
    let changed=false;
    delete view.dataset.propertyRouteIsolation;
    if(view.style.getPropertyValue("display")==="none"&&view.style.getPropertyPriority("display")==="important"){
      view.style.removeProperty("display");
      changed=true;
    }
    if(view.getAttribute("aria-hidden")==="true"){
      view.removeAttribute("aria-hidden");
      changed=true;
    }
    if(view.hasAttribute("inert")){
      view.removeAttribute("inert");
      changed=true;
    }
    return changed;
  }

  function reconcile(){
    scheduled=false;
    if(reconciling)return false;
    const view=propertyView();
    if(!view)return false;
    reconciling=true;
    try{
      return propertyIsActive(view)?releaseActiveProperty(view):isolateInactiveProperty(view);
    }finally{
      reconciling=false;
    }
  }

  function scheduleReconcile(){
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(reconcile);
  }

  function observe(){
    const view=propertyView();
    if(!view)return false;
    observer?.disconnect();
    observer=new MutationObserver(scheduleReconcile);
    observer.observe(view,{attributes:true,attributeFilter:["class","style","aria-hidden","inert","hidden"]});
    return true;
  }

  function install(){
    reconcile();
    observe();
    global.addEventListener("thebe:workspace-view-change",reconcile);
    global.addEventListener("pageshow",reconcile);
    global.setTimeout?.(reconcile,0);
    global.setTimeout?.(reconcile,220);
    global.setTimeout?.(reconcile,760);
    document.documentElement.dataset.propertyRouteIsolationRelease=RELEASE;
    return true;
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();

  global.ThebeWorkspacePropertyRouteIsolation=Object.freeze({
    release:RELEASE,
    reconcile,
    state:()=>{
      const view=propertyView();
      return {
        active:propertyIsActive(view),
        isolated:!!view&&view.dataset.propertyRouteIsolation===RELEASE,
        display:view?.style.getPropertyValue("display")||"",
        displayPriority:view?.style.getPropertyPriority("display")||""
      };
    }
  });
})(window);
