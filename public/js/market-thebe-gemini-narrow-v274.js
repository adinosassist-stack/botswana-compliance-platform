(()=>{
  "use strict";

  const RELEASE="20261013-market-thebe-gemini-narrow-v274";
  const DOCK_SELECTOR='#thebeAiDock[data-surface="public"]';
  const GATE_SELECTOR="#marketingGate";
  const OWNED_PROPS=["left","right","top","bottom","width","min-width","max-width","height","min-height","max-height","border-radius"];
  let frame=0;

  const important=(node,property,value)=>node?.style?.setProperty(property,value,"important");
  const clear=(node,property)=>node?.style?.removeProperty(property);

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

  function releaseDesktopGeometry(dock,gate){
    for(const property of OWNED_PROPS)clear(dock,property);
    clear(gate,"padding-right");
    delete dock.dataset.geminiNarrowV274;
  }

  function applyGeminiNarrowGeometry(){
    const dock=document.querySelector(DOCK_SELECTOR);
    if(!dock)return false;
    const gate=document.querySelector(GATE_SELECTOR);
    const size=geometry(window.innerWidth);
    if(!size){
      releaseDesktopGeometry(dock,gate);
      return true;
    }

    dock.dataset.geminiNarrowV274="1";
    dock.dataset.geminiNarrowRelease=RELEASE;
    important(dock,"left","auto");
    important(dock,"right",`${size.edge}px`);
    important(dock,"top",`${size.edge}px`);
    important(dock,"bottom",`${size.edge}px`);
    important(dock,"width",`${size.width}px`);
    important(dock,"min-width",`${size.width}px`);
    important(dock,"max-width",`${size.width}px`);
    important(dock,"height","auto");
    important(dock,"min-height","0");
    important(dock,"max-height","none");
    important(dock,"border-radius",`${size.radius}px`);
    important(gate,"padding-right",`${size.width+size.laneGap}px`);
    return true;
  }

  function schedule(){
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;
      applyGeminiNarrowGeometry();
    });
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",schedule,{once:true});
  else schedule();

  window.addEventListener("load",schedule,{once:true});
  window.addEventListener("resize",schedule,{passive:true});

  if(window.MutationObserver){
    const observer=new MutationObserver(records=>{
      for(const record of records){
        if([...record.addedNodes].some(node=>node?.nodeType===1&&(node.matches?.(DOCK_SELECTOR)||node.querySelector?.(DOCK_SELECTOR)))){
          schedule();
          break;
        }
      }
    });
    const start=()=>observer.observe(document.body||document.documentElement,{childList:true,subtree:true});
    if(document.body)start();
    else document.addEventListener("DOMContentLoaded",start,{once:true});
  }
})();
