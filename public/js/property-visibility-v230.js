(function(global){
  "use strict";
  const RELEASE="20261003-property-compact-lifecycle-v262";
  function visible(node){
    if(!node)return false;
    const style=global.getComputedStyle?.(node);
    const rect=node.getBoundingClientRect?.();
    return !!style&&style.display!=="none"&&style.visibility!=="hidden"&&Number(style.opacity||1)>0&&!!rect&&rect.width>0&&rect.height>0;
  }
  function repairNode(node,display){
    if(!node)return;
    node.hidden=false;
    node.removeAttribute("hidden");
    node.removeAttribute("inert");
    node.removeAttribute("aria-hidden");
    node.style.removeProperty("visibility");
    node.style.removeProperty("opacity");
    if(global.getComputedStyle?.(node)?.display==="none")node.style.setProperty("display",display,"important");
  }
  function ensurePropertyVisible(){
    const view=document.getElementById("propertyintelligence");
    if(!view||!view.classList.contains("active"))return false;
    repairNode(view,"block");
    const layout=view.querySelector(".property-layout-v224");
    const calculator=view.querySelector(".property-calculator-v224");
    const price=view.querySelector("#propertyPurchasePrice");
    const rent=view.querySelector("#propertyMonthlyRent");
    const analyse=view.querySelector(".property-analyse-button");
    repairNode(layout,"block");
    repairNode(calculator,"block");
    // Recovery owns visibility only. Responsive geometry remains CSS-owned so mobile/desktop rules cannot be pinned by stale inline !important styles.
    repairNode(view.querySelector(".property-quick-rows"),"grid");
    view.querySelectorAll(".property-input-row").forEach(node=>repairNode(node,"flex"));
    repairNode(view.querySelector(".property-input-pair"),"grid");
    repairNode(analyse,"block");
    const ok=[calculator,price,rent,analyse].every(visible);
    view.dataset.propertyVisibility=ok?"ready":"repairing";
    return ok;
  }
  function schedule(){
    ensurePropertyVisible();
    global.requestAnimationFrame?.(()=>global.requestAnimationFrame?.(()=>ensurePropertyVisible()));
    global.setTimeout?.(ensurePropertyVisible,180);
    global.setTimeout?.(ensurePropertyVisible,600);
  }
  global.addEventListener("thebe:workspace-view-change",event=>{
    if(String(event?.detail?.id||"")==="propertyintelligence")schedule();
  });
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",schedule,{once:true});else schedule();
  global.ThebePropertyVisibility=Object.freeze({release:RELEASE,repair:ensurePropertyVisible,state:()=>({ready:ensurePropertyVisible()})});
})(window);
