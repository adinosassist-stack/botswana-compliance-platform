(()=>{
  "use strict";

  const RELEASE="20261014-market-thebe-gemini-lane-v277";
  const DOCK_ID="thebeAiDock";
  const GATE_ID="marketingGate";
  const OWNED_PROPS=["left","right","top","bottom","width","min-width","max-width","height","min-height","max-height","border-radius","box-sizing"];
  const GATE_OWNED_PROPS=["padding-right","box-sizing","max-width"];
  let frame=0;

  function setImportant(node,property,value){
    if(!node?.style)return;
    if(node.style.getPropertyValue(property)===value&&node.style.getPropertyPriority(property)==="important")return;
    node.style.setProperty(property,value,"important");
  }

  function clear(node,property){
    if(!node?.style?.getPropertyValue(property))return;
    node.style.removeProperty(property);
  }

  function geometry(viewportWidth){
    if(viewportWidth>=1200){
      return {
        width:Math.round(Math.max(360,Math.min(420,viewportWidth*0.28))),
        edge:16,
        laneGap:32,
        radius:24
      };
    }
    if(viewportWidth>=1024){
      return {
        width:Math.round(Math.max(332,Math.min(360,viewportWidth*0.31))),
        edge:12,
        laneGap:24,
        radius:22
      };
    }
    return null;
  }

  function dockIsVisible(dock){
    if(!dock||dock.hidden||dock.getAttribute("aria-hidden")==="true")return false;
    const style=getComputedStyle(dock);
    if(style.display==="none"||style.visibility==="hidden"||style.contentVisibility==="hidden")return false;
    return true;
  }

  function releaseDesktopGeometry(dock,gate){
    if(dock){
      for(const property of OWNED_PROPS)clear(dock,property);
      delete dock.dataset.geminiNarrowV274;
      delete dock.dataset.geminiNarrowRelease;
    }
    for(const property of GATE_OWNED_PROPS)clear(gate,property);
  }

  function applyGeminiNarrowGeometry(){
    const dock=document.getElementById(DOCK_ID);
    const gate=document.getElementById(GATE_ID);
    if(!dock)return false;

    const size=geometry(window.innerWidth);
    if(dock.dataset.surface!=="public"||!size){
      releaseDesktopGeometry(dock,gate);
      return true;
    }

    dock.dataset.geminiNarrowV274="1";
    dock.dataset.geminiNarrowRelease=RELEASE;
    setImportant(dock,"left","auto");
    setImportant(dock,"right",`${size.edge}px`);
    setImportant(dock,"top",`${size.edge}px`);
    setImportant(dock,"bottom",`${size.edge}px`);
    setImportant(dock,"width",`${size.width}px`);
    setImportant(dock,"min-width",`${size.width}px`);
    setImportant(dock,"max-width",`${size.width}px`);
    setImportant(dock,"height","auto");
    setImportant(dock,"min-height","0");
    setImportant(dock,"max-height","none");
    setImportant(dock,"border-radius",`${size.radius}px`);
    setImportant(dock,"box-sizing","border-box");

    /* Keep the market's content box left of the Gemini rail even if another
       market stylesheet gives the gate width:100%. Border-box prevents the
       reserved padding from expanding the page underneath the fixed rail. */
    setImportant(gate,"box-sizing","border-box");
    setImportant(gate,"max-width","100%");
    const reserve=dockIsVisible(dock)?`${size.width+size.laneGap}px`:"0px";
    setImportant(gate,"padding-right",reserve);
    return true;
  }

  function schedule(){
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;
      applyGeminiNarrowGeometry();
    });
  }

  function startObserver(){
    if(!window.MutationObserver)return;
    const root=document.body||document.documentElement;
    if(!root)return;
    const observer=new MutationObserver(records=>{
      for(const record of records){
        if(record.type==="attributes"){
          const target=record.target;
          if(target===document.body||target?.id===DOCK_ID||target?.closest?.(`#${DOCK_ID}`)){
            schedule();
            return;
          }
        }
        if([...record.addedNodes].some(node=>node?.nodeType===1&&(node.id===DOCK_ID||node.querySelector?.(`#${DOCK_ID}`)))){
          schedule();
          return;
        }
      }
    });
    observer.observe(root,{
      childList:true,
      subtree:true,
      attributes:true,
      attributeFilter:["hidden","aria-hidden","data-surface","class","style"]
    });
  }

  const start=()=>{
    schedule();
    startObserver();
  };

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();

  window.addEventListener("load",schedule,{once:true});
  window.addEventListener("resize",schedule,{passive:true});
  window.addEventListener("pageshow",schedule,{passive:true});
  window.addEventListener("thebe:spatial-dock",schedule);
})();
