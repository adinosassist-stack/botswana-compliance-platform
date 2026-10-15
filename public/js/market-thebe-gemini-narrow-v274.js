(()=>{
  "use strict";

  const RELEASE="20261013-market-thebe-gemini-parity-v275";
  const DOCK_ID="thebeAiDock";
  const GATE_ID="marketingGate";
  const OWNED_PROPS=["left","right","top","bottom","width","min-width","max-width","height","min-height","max-height","border-radius","box-sizing"];
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

  function geometry(viewportWidth,expanded=false){
    if(viewportWidth>=1200){
      if(expanded){
        return {
          width:560,
          minWidth:480,
          maxWidth:560,
          edge:16,
          laneGap:32,
          radius:24
        };
      }
      const width=Math.round(Math.max(360,Math.min(420,viewportWidth*0.28)));
      return {
        width,
        minWidth:width,
        maxWidth:width,
        edge:16,
        laneGap:32,
        radius:24
      };
    }
    if(viewportWidth>=1024){
      if(expanded){
        return {
          width:460,
          minWidth:400,
          maxWidth:460,
          edge:12,
          laneGap:24,
          radius:22
        };
      }
      const width=Math.round(Math.max(332,Math.min(360,viewportWidth*0.31)));
      return {
        width,
        minWidth:width,
        maxWidth:width,
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
      delete dock.dataset.geminiNarrowExpanded;
    }
    clear(gate,"padding-right");
  }

  function applyGeminiNarrowGeometry(){
    const dock=document.getElementById(DOCK_ID);
    const gate=document.getElementById(GATE_ID);
    if(!dock)return false;

    const expanded=dock.dataset.expanded==="true"||document.body?.classList.contains("thebe-ai-expanded");
    const size=geometry(window.innerWidth,expanded);
    if(dock.dataset.surface!=="public"||!size){
      releaseDesktopGeometry(dock,gate);
      return true;
    }

    dock.dataset.geminiNarrowV274="1";
    dock.dataset.geminiNarrowRelease=RELEASE;
    dock.dataset.geminiNarrowExpanded=expanded?"1":"0";
    setImportant(dock,"left","auto");
    setImportant(dock,"right",`${size.edge}px`);
    setImportant(dock,"top",`${size.edge}px`);
    setImportant(dock,"bottom",`${size.edge}px`);
    setImportant(dock,"width",`${size.width}px`);
    setImportant(dock,"min-width",`${size.minWidth}px`);
    setImportant(dock,"max-width",`${size.maxWidth}px`);
    setImportant(dock,"height","auto");
    setImportant(dock,"min-height","0");
    setImportant(dock,"max-height","none");
    setImportant(dock,"border-radius",`${size.radius}px`);
    setImportant(dock,"box-sizing","border-box");

    /* Gemini behaviour: the content lane exists only while the rail is visible.
       Closing/hiding Thebe immediately gives the full market width back. */
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
      attributeFilter:["hidden","aria-hidden","data-surface","data-expanded","class","style"]
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
