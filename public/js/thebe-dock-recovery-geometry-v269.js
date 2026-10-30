(function bootstrapThebeDockRecoveryGeometry(global){
  "use strict";
  const RELEASE="20261003-emergency-dock-geometry-v269";
  const PROPERTY_ISOLATION_RELEASE="20261003-property-view-isolation-v273";
  const RECOVERY_STYLE_ID="thebe-dock-recovery-geometry-v269-style";
  const WORKSPACE_RESIZE_RELEASE="20261015-workspace-dock-resize-v0518";
  const WORKSPACE_RESIZE_STYLE_ID="thebe-workspace-dock-resize-v0518-style";
  const WORKSPACE_WIDTH_KEY="thebe:workspace-dock:width:v1";
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

  function workspaceWidthBounds(viewport=viewportWidth()){
    const width=Math.max(0,Number(viewport)||0);
    if(width<1024)return {min:0,defaultWidth:0,expandedDefault:0,max:0};
    if(width>=1200){const market=Math.min(720,width*.38);return {min:430,defaultWidth:Math.round(market),expandedDefault:Math.round(Math.min(780,Math.max(520,width*.44))),max:Math.round(Math.min(780,width-64))};}
    return {min:288,defaultWidth:320,expandedDefault:440,max:440};
  }

  function clampWorkspaceWidth(value,bounds=workspaceWidthBounds()){
    const numeric=Number(value);
    const fallback=bounds.defaultWidth||0;
    if(!Number.isFinite(numeric))return fallback;
    return Math.min(bounds.max,Math.max(bounds.min,Math.round(numeric)));
  }

  function readStoredWorkspaceWidth(){
    try{
      const raw=global.localStorage?.getItem?.(WORKSPACE_WIDTH_KEY);
      if(raw===null||raw===undefined||raw==="")return null;
      const numeric=Number(raw);
      return Number.isFinite(numeric)?numeric:null;
    }catch{return null}
  }

  function writeStoredWorkspaceWidth(width){
    try{global.localStorage?.setItem?.(WORKSPACE_WIDTH_KEY,String(Math.round(width)))}catch{}
  }

  function clearStoredWorkspaceWidth(){
    try{global.localStorage?.removeItem?.(WORKSPACE_WIDTH_KEY)}catch{}
  }

  function ensureWorkspaceResizeStyle(){
    const document=global.document;
    if(!document||document.getElementById(WORKSPACE_RESIZE_STYLE_ID))return;
    const style=document.createElement("style");
    style.id=WORKSPACE_RESIZE_STYLE_ID;
    style.textContent=`
#thebeAiDock .thebe-workspace-dock-resize-handle{display:none}
@media (min-width:1024px){
 body #thebeAiDock[data-surface="workspace"][data-workspace-resizable="true"]{left:auto!important;right:16px!important;top:88px!important;bottom:auto!important;width:var(--thebe-spatial-width)!important;max-width:var(--thebe-spatial-width)!important}
 #thebeAiDock[data-surface="workspace"][data-workspace-resizable="true"] .thebe-workspace-dock-resize-handle{display:flex;position:absolute;left:-8px;top:50%;transform:translateY(-50%);width:16px;height:88px;z-index:8;align-items:center;justify-content:center;border:0;padding:0;background:transparent;cursor:ew-resize;touch-action:none}
 #thebeAiDock[data-surface="workspace"] .thebe-workspace-dock-resize-handle::before{content:"";display:block;width:3px;height:42px;border-radius:999px;background:rgba(142,180,208,.62);box-shadow:0 0 0 1px rgba(5,24,39,.35)}
 #thebeAiDock[data-surface="workspace"] .thebe-workspace-dock-resize-handle:hover::before,#thebeAiDock[data-surface="workspace"] .thebe-workspace-dock-resize-handle:focus-visible::before{background:#8fd2ff;height:52px}
 #thebeAiDock[data-surface="workspace"] .thebe-workspace-dock-resize-handle:focus-visible{outline:3px solid #2f8fe6;outline-offset:2px;border-radius:10px}
 body.thebe-workspace-dock-resizing,body.thebe-workspace-dock-resizing *{cursor:ew-resize!important;user-select:none!important}
}
`;
    (document.head||document.documentElement||document.body)?.appendChild(style);
  }

  function ensureWorkspaceResizeHandle(dock){
    if(!dock)return null;
    let handle=dock.querySelector?.(".thebe-workspace-dock-resize-handle");
    if(handle)return handle;
    handle=global.document?.createElement?.("button");
    if(!handle)return null;
    handle.type="button";
    handle.className="thebe-workspace-dock-resize-handle";
    handle.setAttribute("aria-label","Resize Thebe assistant panel");
    handle.setAttribute("aria-orientation","vertical");
    handle.title="Drag to resize · double-click to reset";
    dock.appendChild(handle);

    let drag=null;
    const applyPreferred=(next,{persist=true}={})=>{
      const bounds=workspaceWidthBounds();
      if(!bounds.defaultWidth)return 0;
      const value=clampWorkspaceWidth(next,bounds);
      if(persist)writeStoredWorkspaceWidth(value);
      applyWorkspaceWidth(dock,{preferred:value,stored:persist});
      return value;
    };
    const stopDrag=()=>{
      if(!drag)return;
      drag=null;
      global.document?.body?.classList?.remove("thebe-workspace-dock-resizing");
    };
    handle.addEventListener("pointerdown",event=>{
      if(event.button!==undefined&&event.button!==0)return;
      const bounds=workspaceWidthBounds();
      if(!bounds.defaultWidth)return;
      const current=Number(dock.dataset.workspaceWidth)||dock.getBoundingClientRect?.().width||bounds.defaultWidth;
      drag={pointerId:event.pointerId,startX:event.clientX,startWidth:current};
      handle.setPointerCapture?.(event.pointerId);
      global.document?.body?.classList?.add("thebe-workspace-dock-resizing");
      event.preventDefault?.();
    });
    handle.addEventListener("pointermove",event=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      // The dock is anchored to the right edge, so dragging left increases width.
      applyPreferred(drag.startWidth-(event.clientX-drag.startX));
      event.preventDefault?.();
    });
    handle.addEventListener("pointerup",stopDrag);
    handle.addEventListener("pointercancel",stopDrag);
    handle.addEventListener("dblclick",event=>{
      clearStoredWorkspaceWidth();
      const bounds=workspaceWidthBounds();
      applyWorkspaceWidth(dock,{preferred:bounds.defaultWidth,stored:false});
      event.preventDefault?.();
    });
    handle.addEventListener("keydown",event=>{
      const bounds=workspaceWidthBounds();
      if(!bounds.defaultWidth)return;
      const current=Number(dock.dataset.workspaceWidth)||bounds.defaultWidth;
      let next=null;
      if(event.key==="ArrowLeft")next=current+16;
      if(event.key==="ArrowRight")next=current-16;
      if(event.key==="Home"){
        clearStoredWorkspaceWidth();
        applyWorkspaceWidth(dock,{preferred:bounds.defaultWidth,stored:false});
        event.preventDefault();
        return;
      }
      if(event.key==="End")next=bounds.max;
      if(next===null)return;
      applyPreferred(next);
      event.preventDefault();
    });
    return handle;
  }

  function applyWorkspaceWidth(dock,{preferred,stored}={}){
    const document=global.document;
    const body=document?.body;
    if(!dock||!body)return 0;
    const viewport=viewportWidth();
    const bounds=workspaceWidthBounds(viewport);
    if(dock.dataset.surface!=="workspace"||!bounds.defaultWidth||!spatialStylesheetHealthy(dock)){
      dock.dataset.workspaceResizable="false";
      delete dock.dataset.workspaceWidth;
      if(body.style.getPropertyValue("--thebe-spatial-width"))body.style.removeProperty("--thebe-spatial-width");
      return 0;
    }
    ensureWorkspaceResizeStyle();
    ensureWorkspaceResizeHandle(dock);
    const storedRaw=stored===undefined?readStoredWorkspaceWidth():(stored?preferred:null);
    const hasStored=storedRaw!==null&&storedRaw!==undefined&&Number.isFinite(Number(storedRaw));
    const base=clampWorkspaceWidth(preferred??storedRaw??bounds.defaultWidth,bounds);
    // Before the user chooses a size, preserve the roomy expanded state. Once a
    // manual width is saved, that width becomes authoritative in both states.
    const active=hasStored?base:(body.classList.contains("thebe-ai-expanded")?Math.max(base,bounds.expandedDefault):base);
    const clamped=clampWorkspaceWidth(active,bounds);
    const cssWidth=`${clamped}px`;
    if(body.style.getPropertyValue("--thebe-spatial-width")!==cssWidth)body.style.setProperty("--thebe-spatial-width",cssWidth);
    dock.dataset.workspaceResizable="true";
    dock.dataset.workspaceWidth=String(clamped);
    dock.dataset.workspaceResizeRelease=WORKSPACE_RESIZE_RELEASE;
    return clamped;
  }

  // Optional floating position for the workspace dock. Keep the existing width
  // manager authoritative; position is only applied on desktop with healthy CSS.
  const WORKSPACE_POSITION_KEY="thebe:workspace-dock:position:v1";
  function readDockPosition(){
    try{const value=JSON.parse(global.localStorage?.getItem?.(WORKSPACE_POSITION_KEY)||"null");return Number.isFinite(value?.x)&&Number.isFinite(value?.y)?value:null}catch{return null}
  }
  function setDockPosition(dock,position){
    if(!dock||!position||viewportWidth()<1024)return;
    const rect=dock.getBoundingClientRect();
    const x=Math.max(8,Math.min(Math.round(position.x),Math.max(8,viewportWidth()-rect.width-8)));
    const y=Math.max(8,Math.min(Math.round(position.y),Math.max(8,(global.innerHeight||768)-rect.height-8)));
    if(dock.dataset.workspaceFloating!=="true")dock.dataset.workspaceFloating="true";
    if(dock.style.getPropertyValue("--thebe-dock-float-left")!==x+"px")dock.style.setProperty("--thebe-dock-float-left",x+"px");
    if(dock.style.getPropertyValue("--thebe-dock-float-top")!==y+"px")dock.style.setProperty("--thebe-dock-float-top",y+"px");
  }
  function ensureDockMovement(dock){
    if(!dock||dock.dataset.workspaceMoveReady==="true")return;
    const head=dock.querySelector(".thebe-ai-dock-head");
    if(!head)return;
    dock.dataset.workspaceMoveReady="true";
    const styleId="thebe-workspace-dock-move-v1-style";
    if(!global.document.getElementById(styleId)){
      const style=global.document.createElement("style");style.id=styleId;
      style.textContent='@media(min-width:1024px){body #thebeAiDock[data-surface="workspace"][data-workspace-floating="true"]{left:var(--thebe-dock-float-left)!important;right:auto!important;top:var(--thebe-dock-float-top)!important;bottom:auto!important}#thebeAiDock[data-workspace-move-ready="true"] .thebe-ai-dock-title{cursor:grab;touch-action:none}#thebeAiDock[data-workspace-floating="true"] .thebe-ai-dock-title:active{cursor:grabbing}}';
      (global.document.head||global.document.documentElement).appendChild(style);
    }
    const title=head.querySelector(".thebe-ai-dock-title");
    if(!title)return;
    title.title="Drag to move Thebe AI · double-click to reset";
    let drag=null;
    title.addEventListener("pointerdown",event=>{
      if(viewportWidth()<1024||dock.dataset.surface!=="workspace"||event.button!==0)return;
      const rect=dock.getBoundingClientRect();drag={id:event.pointerId,dx:event.clientX-rect.left,dy:event.clientY-rect.top};
      title.setPointerCapture?.(event.pointerId);event.preventDefault();
    });
    title.addEventListener("pointermove",event=>{
      if(!drag||drag.id!==event.pointerId)return;
      setDockPosition(dock,{x:event.clientX-drag.dx,y:event.clientY-drag.dy});
    });
    const finish=()=>{if(!drag)return;drag=null;if(dock.dataset.workspaceFloating==="true")try{global.localStorage?.setItem?.(WORKSPACE_POSITION_KEY,JSON.stringify({x:parseInt(dock.style.getPropertyValue("--thebe-dock-float-left"),10),y:parseInt(dock.style.getPropertyValue("--thebe-dock-float-top"),10)}))}catch{}};
    title.addEventListener("pointerup",finish);title.addEventListener("pointercancel",finish);
    title.addEventListener("dblclick",()=>{try{global.localStorage?.removeItem?.(WORKSPACE_POSITION_KEY)}catch{};delete dock.dataset.workspaceFloating;dock.style.removeProperty("--thebe-dock-float-left");dock.style.removeProperty("--thebe-dock-float-top")});
    const saved=readDockPosition();if(saved)setDockPosition(dock,saved);
  }

  function syncWorkspaceResize(dock){
    return applyWorkspaceWidth(dock,{});
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
    // Route isolation owns inactive Property display; removing its rule would
    // cause the two mutation observers to continuously undo each other.
    const routeIsolation=global.ThebeWorkspacePropertyRouteIsolation;
    const routeOwnsDisplay=!!routeIsolation?.release&&property.dataset.propertyRouteIsolation===routeIsolation.release;
    for(const name of ["display","visibility","opacity"]){
      if(name==="display"&&routeOwnsDisplay)continue;
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

  function spatialStylesheetHealthy(dock){
    try{return global.getComputedStyle?.(dock)?.getPropertyValue("--thebe-spatial-dock").trim()==="1"}
    catch{return false}
  }

  function repair(){
    const document=global.document;
    if(!document)return false;
    isolateInactiveProperty();
    const dock=document.getElementById("thebeAiDock");
    if(!dock){
      if(document.body?.style?.getPropertyValue?.("--thebe-spatial-width"))document.body.style.removeProperty("--thebe-spatial-width");
      releaseAll();
      return false;
    }
    syncWorkspaceResize(dock);
    if(dock.dataset.surface==="workspace"&&viewportWidth()>=1024&&spatialStylesheetHealthy(dock))ensureDockMovement(dock);
    if(dock.dataset.cssRecovery!=="1"){
      if(spatialStylesheetHealthy(dock)){
        releaseAll();
        clearMarker(dock);
        return false;
      }
      dock.dataset.cssRecovery="1";
    }
    // Emergency geometry intentionally ignores user sizing. If the primary
    // spatial stylesheet is unavailable, deterministic fallback dimensions win.
    if(document.body?.style?.getPropertyValue?.("--thebe-spatial-width"))document.body.style.removeProperty("--thebe-spatial-width");
    dock.dataset.workspaceResizable="false";
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

  global.ThebeDockRecoveryGeometry=Object.freeze({release:RELEASE,propertyIsolationRelease:PROPERTY_ISOLATION_RELEASE,workspaceResizeRelease:WORKSPACE_RESIZE_RELEASE,widthFor,geometryFor,workspaceWidthBounds,clampWorkspaceWidth,applyWorkspaceWidth,repair,isolateInactiveProperty});
})(typeof window!=="undefined"?window:globalThis);