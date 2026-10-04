(function bootstrapThebeDockRecoveryGeometry(global){
  "use strict";
  const RELEASE="20261004-mobile-dock-geometry-v270";
  const PROPERTY_ISOLATION_RELEASE="20261003-property-view-isolation-v273";
  const RECOVERY_STYLE_ID="thebe-dock-recovery-geometry-v269-style";
  const managed=new Map();
  let queued=false;

  function viewportWidth(){
    return Math.max(0,Number(global.innerWidth||global.document?.documentElement?.clientWidth||0));
  }

  function widthFor(viewport,expanded=false){
    const width=Math.max(0,Number(viewport)||0);
    if(width<1024)return 0;
    if(width>=1200)return expanded?344:272;
    return expanded?324:256;
  }

  function geometryFor(viewport,expanded=false){
    const width=Math.max(0,Number(viewport)||0);
    if(width<1024){
      if(!expanded){
        return {position:"fixed",left:"auto",right:"12px",top:"auto",bottom:"calc(104px + env(safe-area-inset-bottom))",width:"76px","max-width":"76px",height:"76px","min-height":"0","max-height":"76px","border-radius":"999px","z-index":"900"};
      }
      return {position:"fixed",left:"8px",right:"8px",top:"8px",bottom:"calc(104px + env(safe-area-inset-bottom))",width:"auto","max-width":"none",height:"auto","min-height":"0","max-height":"calc(100dvh - 112px - env(safe-area-inset-bottom))","border-radius":"20px","z-index":"900"};
    }
    const dockWidth=widthFor(width,expanded);
    return {position:"fixed",left:"auto",right:"16px",top:"88px",bottom:"auto",width:`${dockWidth}px`,"max-width":`${dockWidth}px`,height:"min(610px,calc(100dvh - 104px))","min-height":"0","max-height":"calc(100dvh - 104px)","border-radius":"20px","z-index":"900"};
  }

  function ensureRecoveryStyle(){
    const document=global.document;
    if(!document||document.getElementById(RECOVERY_STYLE_ID))return;
    const style=document.createElement("style");
    style.id=RECOVERY_STYLE_ID;
    style.textContent=`
#thebeAiDock[data-css-recovery="1"]{position:fixed!important;left:auto!important;right:16px!important;top:88px!important;bottom:auto!important;width:272px!important;max-width:272px!important;height:min(610px,calc(100dvh - 104px))!important;min-height:0!important;max-height:calc(100dvh - 104px)!important;border-radius:20px!important;z-index:900!important}
#thebeAiDock[data-css-recovery="1"][data-expanded="true"]{width:344px!important;max-width:344px!important}
#thebeAiDock[data-css-recovery="1"] .thebe-ai-orb-button{width:68px!important;min-width:68px!important;max-width:68px!important;height:68px!important;min-height:68px!important;max-height:68px!important;box-sizing:border-box!important;flex:0 0 68px!important}
#thebeAiDock[data-css-recovery="1"] .thebe-ai-voice-card{grid-template-columns:68px minmax(0,1fr)!important;gap:8px!important}
@media (min-width:1024px) and (max-width:1199px){#thebeAiDock[data-css-recovery="1"]{width:256px!important;max-width:256px!important}#thebeAiDock[data-css-recovery="1"][data-expanded="true"]{width:324px!important;max-width:324px!important}}
@media (max-width:1023px){#thebeAiDock[data-css-recovery="1"]{left:auto!important;right:12px!important;top:auto!important;bottom:calc(104px + env(safe-area-inset-bottom))!important;width:76px!important;max-width:76px!important;height:76px!important;min-height:0!important;max-height:76px!important;border-radius:999px!important;z-index:900!important}#thebeAiDock[data-css-recovery="1"][data-expanded="true"]{left:8px!important;right:8px!important;top:8px!important;bottom:calc(104px + env(safe-area-inset-bottom))!important;width:auto!important;max-width:none!important;height:auto!important;min-height:0!important;max-height:calc(100dvh - 112px - env(safe-area-inset-bottom))!important;border-radius:20px!important;z-index:900!important}}
`;
    (document.head||document.documentElement||document.body)?.appendChild(style);
  }

  function setOwned(node,styles,{restore=true}={}){
    if(!node)return;
    let records=managed.get(node);
    if(!records){records=new Map();managed.set(node,records)}
    for(const [property,value] of Object.entries(styles)){
      let record=records.get(property);
      if(!record){
        record={value:node.style.getPropertyValue(property),priority:node.style.getPropertyPriority(property),restore};
        records.set(property,record);
      }
      if(node.style.getPropertyValue(property)!==value||node.style.getPropertyPriority(property)!=="important")node.style.setProperty(property,value,"important");
      record.appliedValue=node.style.getPropertyValue(property);
      record.appliedPriority=node.style.getPropertyPriority(property);
    }
  }

  function releaseNode(node){
    const records=managed.get(node);
    if(!records)return;
    for(const [property,record] of records){
      if(node.style.getPropertyValue(property)!==record.appliedValue||node.style.getPropertyPriority(property)!==record.appliedPriority)continue;
      if(record.restore&&record.value)node.style.setProperty(property,record.value,record.priority);
      else node.style.removeProperty(property);
    }
    managed.delete(node);
  }

  function releaseAll(){for(const node of [...managed.keys()])releaseNode(node)}

  function isolateInactiveProperty(){
    const property=global.document?.getElementById?.("propertyintelligence");
    if(!property||property.classList.contains("active"))return false;
    let changed=false;
    for(const name of ["display","visibility","opacity"]){
      if(!property.style.getPropertyValue(name))continue;
      property.style.removeProperty(name);
      changed=true;
    }
    property.dataset.propertyViewIsolation=PROPERTY_ISOLATION_RELEASE;
    return changed;
  }

  function compactVoice(dock){
    const orb=dock.querySelector?.(".thebe-ai-orb-button");
    const card=dock.querySelector?.(".thebe-ai-voice-card");
    setOwned(orb,{width:"68px","min-width":"68px","max-width":"68px",height:"68px","min-height":"68px","max-height":"68px","box-sizing":"border-box",flex:"0 0 68px"},{restore:false});
    setOwned(card,{"grid-template-columns":"68px minmax(0,1fr)",gap:"8px"},{restore:false});
  }

  function reserveDesktopLane(dock,dockWidth){
    const document=global.document;
    const workspaceMain=document?.querySelector?.("#appShell main");
    const marketingGate=document?.getElementById?.("marketingGate");
    if(dock.dataset.surface==="workspace"){
      releaseNode(marketingGate);
      setOwned(workspaceMain,{"margin-left":"0","margin-right":`calc(${dockWidth}px + 32px)`,width:`calc(100% - ${dockWidth}px - 32px)`,"max-width":"none","padding-left":"20px","padding-right":"20px"});
      return;
    }
    releaseNode(workspaceMain);
    if(dock.dataset.surface==="public")setOwned(marketingGate,{"padding-right":`calc(${dockWidth}px + 32px)`});
    else releaseNode(marketingGate);
  }

  function releaseDesktopLane(){
    const document=global.document;
    releaseNode(document?.querySelector?.("#appShell main"));
    releaseNode(document?.getElementById?.("marketingGate"));
  }

  function clearMarker(dock){if(dock?.dataset?.geometryRecovery===RELEASE)delete dock.dataset.geometryRecovery}

  function repair(){
    const document=global.document;
    if(!document)return false;
    isolateInactiveProperty();
    const dock=document.getElementById("thebeAiDock");
    if(!dock){releaseAll();return false}
    if(dock.dataset.cssRecovery!=="1"){
      releaseAll();
      clearMarker(dock);
      return false;
    }
    ensureRecoveryStyle();
    const width=viewportWidth();
    const expanded=dock.dataset.expanded==="true";
    setOwned(dock,geometryFor(width,expanded),{restore:false});
    compactVoice(dock);
    if(width>=1024)reserveDesktopLane(dock,widthFor(width,expanded));
    else releaseDesktopLane();
    dock.dataset.geometryRecovery=RELEASE;
    return true;
  }

  function schedule(){
    if(queued)return;
    queued=true;
    const run=()=>{queued=false;repair()};
    if(typeof global.queueMicrotask==="function")global.queueMicrotask(run);
    else global.setTimeout?.(run,0);
  }

  if(global.document){
    const start=()=>{
      repair();
      const root=global.document.documentElement||global.document.body;
      if(typeof global.MutationObserver==="function"&&root){
        const observer=new global.MutationObserver(schedule);
        observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:["style","class","data-css-recovery","data-expanded","data-surface"]});
      }
      global.addEventListener?.("resize",repair,{passive:true});
      global.visualViewport?.addEventListener?.("resize",repair,{passive:true});
      global.addEventListener?.("thebe:workspace-view-change",repair);
    };
    if(global.document.readyState==="loading")global.document.addEventListener("DOMContentLoaded",start,{once:true});
    else start();
  }

  global.ThebeDockRecoveryGeometry=Object.freeze({release:RELEASE,propertyIsolationRelease:PROPERTY_ISOLATION_RELEASE,widthFor,geometryFor,repair,isolateInactiveProperty});
})(typeof window!=="undefined"?window:globalThis);