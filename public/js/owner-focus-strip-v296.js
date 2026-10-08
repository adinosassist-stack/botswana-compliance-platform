(function installOwnerFocusV3(global){
  "use strict";

  const RELEASE="20261007-owner-focus-v3-v303";
  const STRIP_ID="ownerFocusStrip";
  const STYLE_ID="ownerFocusStripStyle";
  const ATTENTION_ID="ownerAttentionPanel";
  const SHELL_ID="ownerCommandCentre";
  const FILTERS=Object.freeze({
    all:{label:"All priorities",prompt:"Help me review the owner priority queue and decide what matters next."},
    action:{label:"Needs action",prompt:"Help me review the current items that need action, starting with the most urgent governed item."},
    approvals:{label:"Approvals",prompt:"Help me review the current approval queue, summarize the evidence and trade-offs, and tell me what needs my decision."},
    outcomes:{label:"Pending outcomes",prompt:"Help me review the decisions that still need an outcome recorded and what evidence I should check before closing the loop."}
  });
  const QUEUE_SELECTOR=".owner-review-inbox > .owner-review-row,.owner-attention-list > .owner-attention-item,.owner-outcome-loop > .owner-outcome-row";

  const q=(selector,root=document)=>root.querySelector(selector);
  const qa=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
  let observedPanel=null;
  let panelObserver=null;
  let retryTimer=0;
  let syncFrame=0;
  let activeFilter="all";

  function installStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    style.dataset.release=RELEASE;
    style.textContent=`
#${STRIP_ID}{display:grid;grid-template-columns:minmax(170px,.95fr) repeat(3,minmax(112px,1fr)) auto auto;gap:10px;align-items:stretch;margin:14px 0 18px;padding:10px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:18px;background:color-mix(in srgb,var(--surface,#fff) 92%,transparent);box-shadow:0 10px 28px rgba(15,23,42,.06)}
#${STRIP_ID} .owner-focus-intro{display:flex;flex-direction:column;justify-content:center;padding:2px 8px;min-width:0}
#${STRIP_ID} .owner-focus-kicker{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.6}
#${STRIP_ID} .owner-focus-title{font-size:14px;font-weight:800;line-height:1.2;margin-top:3px}
#${STRIP_ID} .owner-focus-state{display:flex;align-items:center;gap:7px;min-width:0;margin-top:5px;font-size:10px;font-weight:700;opacity:.68}
#${STRIP_ID} .owner-focus-state span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${STRIP_ID} .owner-focus-clear{appearance:none;border:0;background:transparent;color:inherit;padding:0;text-decoration:underline;text-underline-offset:2px;font:inherit;font-weight:800;cursor:pointer}
#${STRIP_ID} .owner-focus-clear[hidden]{display:none!important}
#${STRIP_ID} .owner-focus-metric{appearance:none;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:14px;background:color-mix(in srgb,var(--surface,#fff) 96%,transparent);padding:10px 12px;text-align:left;cursor:pointer;color:inherit;min-width:0;transition:border-color .16s ease,transform .16s ease,background .16s ease}
#${STRIP_ID} .owner-focus-metric:hover{border-color:color-mix(in srgb,currentColor 24%,transparent);transform:translateY(-1px)}
#${STRIP_ID} .owner-focus-metric[aria-pressed="true"]{border-color:color-mix(in srgb,currentColor 38%,transparent);background:color-mix(in srgb,var(--surface,#fff) 86%,currentColor 6%)}
#${STRIP_ID} .owner-focus-value{display:block;font-size:20px;font-weight:850;line-height:1}
#${STRIP_ID} .owner-focus-label{display:block;margin-top:5px;font-size:11px;font-weight:700;opacity:.66;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${STRIP_ID} .owner-focus-next,#${STRIP_ID} .owner-focus-ask{border-radius:14px;padding:0 14px;font:inherit;font-weight:800;cursor:pointer;white-space:nowrap;min-height:44px}
#${STRIP_ID} .owner-focus-next{border:1px solid color-mix(in srgb,currentColor 18%,transparent);background:color-mix(in srgb,var(--surface,#fff) 96%,transparent);color:inherit}
#${STRIP_ID} .owner-focus-ask{border:0;background:#111827;color:#fff}
#${STRIP_ID} .owner-focus-next:hover{border-color:color-mix(in srgb,currentColor 34%,transparent)}
#${STRIP_ID} .owner-focus-ask:hover{filter:brightness(1.08)}
#${STRIP_ID} .owner-focus-next:disabled{opacity:.45;cursor:default}
#${STRIP_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #075985}
#${ATTENTION_ID}[data-owner-focus-filter="action"] .owner-review-inbox,
#${ATTENTION_ID}[data-owner-focus-filter="action"] .owner-outcome-loop{display:none!important}
#${ATTENTION_ID}[data-owner-focus-filter="approvals"] .owner-attention-list,
#${ATTENTION_ID}[data-owner-focus-filter="approvals"] .owner-outcome-loop{display:none!important}
#${ATTENTION_ID}[data-owner-focus-filter="outcomes"] .owner-review-inbox,
#${ATTENTION_ID}[data-owner-focus-filter="outcomes"] .owner-attention-list,
#${ATTENTION_ID}[data-owner-focus-filter="outcomes"] .owner-outcome-history{display:none!important}
@media(max-width:900px){#${STRIP_ID}{grid-template-columns:1fr 1fr 1fr}#${STRIP_ID} .owner-focus-intro{grid-column:1/-1;padding:3px 4px 1px}#${STRIP_ID} .owner-focus-next{grid-column:1/2}#${STRIP_ID} .owner-focus-ask{grid-column:2/4}}
@media(max-width:760px){#${STRIP_ID}{margin:12px 0 16px}#${STRIP_ID} .owner-focus-metric{padding:9px 10px}#${STRIP_ID} .owner-focus-value{font-size:18px}}
@media(max-width:410px){#${STRIP_ID}{gap:7px;padding:8px;border-radius:16px}#${STRIP_ID} .owner-focus-label{font-size:10px}#${STRIP_ID} .owner-focus-value{font-size:17px}#${STRIP_ID} .owner-focus-next,#${STRIP_ID} .owner-focus-ask{grid-column:1/-1}}
@media(prefers-reduced-motion:reduce){#${STRIP_ID} .owner-focus-metric{transition:none}#${STRIP_ID} .owner-focus-metric:hover{transform:none}}
@media(forced-colors:active){#${STRIP_ID},#${STRIP_ID} .owner-focus-metric,#${STRIP_ID} .owner-focus-next,#${STRIP_ID} .owner-focus-ask{border:1px solid ButtonText}#${STRIP_ID} :focus-visible{outline:3px solid Highlight;box-shadow:none}}
`;
    document.head.append(style);
  }

  function metric(label,key){
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="owner-focus-metric";
    btn.dataset.focusMetric=key;
    btn.setAttribute("aria-controls",ATTENTION_ID);
    btn.setAttribute("aria-pressed","false");
    const value=document.createElement("span");
    value.className="owner-focus-value";
    value.textContent="—";
    const caption=document.createElement("span");
    caption.className="owner-focus-label";
    caption.textContent=label;
    btn.append(value,caption);
    btn.addEventListener("click",()=>applyFilter(activeFilter===key?"all":key,{focus:true}));
    return btn;
  }

  function ensureStrip(){
    const shell=q(`#${SHELL_ID}`);
    if(!shell)return null;
    let strip=q(`#${STRIP_ID}`,shell);
    if(strip&&strip.dataset.release===RELEASE)return strip;
    if(strip)strip.remove();
    installStyle();
    strip=document.createElement("section");
    strip.id=STRIP_ID;
    strip.className="owner-focus-strip";
    strip.dataset.release=RELEASE;
    strip.dataset.filter=activeFilter;
    strip.setAttribute("aria-label","Owner focus");

    const intro=document.createElement("div");
    intro.className="owner-focus-intro";
    intro.setAttribute("aria-live","polite");
    const kicker=document.createElement("span");
    kicker.className="owner-focus-kicker";
    kicker.textContent="Owner focus";
    const title=document.createElement("span");
    title.className="owner-focus-title";
    title.dataset.ownerFocusTitle="true";
    title.textContent="Decide what matters next";
    const state=document.createElement("div");
    state.className="owner-focus-state";
    const stateLabel=document.createElement("span");
    stateLabel.dataset.ownerFocusState="true";
    stateLabel.textContent=FILTERS[activeFilter].label;
    const clear=document.createElement("button");
    clear.type="button";
    clear.className="owner-focus-clear";
    clear.textContent="Show all";
    clear.hidden=activeFilter==="all";
    clear.addEventListener("click",()=>applyFilter("all",{focus:false}));
    state.append(stateLabel,clear);
    intro.append(kicker,title,state);

    const next=document.createElement("button");
    next.type="button";
    next.className="owner-focus-next";
    next.textContent="Review next";
    next.setAttribute("aria-controls",ATTENTION_ID);
    next.addEventListener("click",reviewNext);

    const ask=document.createElement("button");
    ask.type="button";
    ask.className="owner-focus-ask";
    ask.textContent="Ask Thebe";
    ask.addEventListener("click",focusThebe);
    strip.append(intro,metric("Needs action","action"),metric("Approvals","approvals"),metric("Pending outcomes","outcomes"),next,ask);

    const head=q(".owner-command-head",shell);
    if(head)head.insertAdjacentElement("afterend",strip);else shell.prepend(strip);
    updateFilterUi(strip);
    return strip;
  }

  function setMetric(strip,key,value){
    const metricNode=q(`[data-focus-metric="${key}"]`,strip);
    const valueNode=q(".owner-focus-value",metricNode||strip);
    const next=String(value);
    if(valueNode&&valueNode.textContent!==next)valueNode.textContent=next;
    if(metricNode)metricNode.setAttribute("aria-label",`${FILTERS[key].label}: ${next}. Open this queue.`);
  }

  function itemTimestamp(node){
    if(!node)return null;
    const sources=[
      q("time[datetime]",node)?.getAttribute("datetime"),
      node.dataset?.createdAt,
      node.dataset?.updatedAt,
      q("[data-created-at]",node)?.getAttribute("data-created-at"),
      q("[data-updated-at]",node)?.getAttribute("data-updated-at")
    ];
    const now=Date.now();
    for(const raw of sources){
      if(!raw)continue;
      const stamp=Date.parse(String(raw));
      if(Number.isFinite(stamp)&&stamp>0&&stamp<=now+5*60*1000)return stamp;
    }
    return null;
  }

  function queueNodes(panel,key="all"){
    if(!panel)return [];
    if(key==="approvals")return qa(".owner-review-inbox > .owner-review-row",panel);
    if(key==="outcomes")return qa(".owner-outcome-loop > .owner-outcome-row",panel);
    if(key==="action")return qa(".owner-attention-list > .owner-attention-item",panel);
    return qa(QUEUE_SELECTOR,panel);
  }

  function oldestQueueAge(panel,key="all"){
    const stamps=queueNodes(panel,key).map(itemTimestamp).filter(Number.isFinite);
    if(!stamps.length)return "";
    const ageMs=Math.max(0,Date.now()-Math.min(...stamps));
    const minutes=Math.floor(ageMs/60000);
    if(minutes<60)return `${Math.max(1,minutes)}m`;
    const hours=Math.floor(minutes/60);
    if(hours<48)return `${hours}h`;
    return `${Math.floor(hours/24)}d`;
  }

  function updateFilterUi(strip=ensureStrip(),oldestAge=""){
    if(!strip)return;
    strip.dataset.filter=activeFilter;
    qa("[data-focus-metric]",strip).forEach(node=>node.setAttribute("aria-pressed",String(node.dataset.focusMetric===activeFilter)));
    const state=q("[data-owner-focus-state]",strip);
    if(state)state.textContent=`${FILTERS[activeFilter]?.label||FILTERS.all.label}${oldestAge?` · Oldest ${oldestAge}`:""}`;
    const clear=q(".owner-focus-clear",strip);
    if(clear)clear.hidden=activeFilter==="all";
  }

  function queueTarget(panel,key){
    return queueNodes(panel,key)[0]||null;
  }

  function focusQueueTarget(panel,target){
    if(!panel||!target)return false;
    panel.scrollIntoView({behavior:"smooth",block:"start"});
    if(!target.hasAttribute("tabindex"))target.setAttribute("tabindex","-1");
    try{target.focus({preventScroll:true})}catch{target.focus()}
    return true;
  }

  function reviewNext(){
    const panel=q(`#${ATTENTION_ID}`);
    if(!panel)return;
    focusQueueTarget(panel,queueTarget(panel,activeFilter));
  }

  function applyFilter(key,{focus=false}={}){
    activeFilter=FILTERS[key]?key:"all";
    const panel=q(`#${ATTENTION_ID}`);
    if(panel){
      if(activeFilter==="all")delete panel.dataset.ownerFocusFilter;
      else panel.dataset.ownerFocusFilter=activeFilter;
    }
    updateFilterUi();
    scheduleSync();
    if(!focus||!panel)return;
    focusQueueTarget(panel,queueTarget(panel,activeFilter));
  }

  function sync(){
    const strip=ensureStrip();
    const panel=q(`#${ATTENTION_ID}`);
    if(!strip||!panel)return;
    const unavailable=/priority queue unavailable/i.test(panel.textContent||"");
    const title=q("[data-owner-focus-title]",strip);
    const next=q(".owner-focus-next",strip);
    if(unavailable){
      setMetric(strip,"action","—");
      setMetric(strip,"approvals","—");
      setMetric(strip,"outcomes","—");
      if(title)title.textContent="Priority queue unavailable";
      if(next){
        next.disabled=true;
        next.setAttribute("aria-label","Priority queue unavailable");
      }
      strip.dataset.state="unavailable";
      return;
    }
    const approvals=qa(".owner-review-inbox > .owner-review-row",panel).length;
    const total=Number(q(".owner-panel-head .badge",panel)?.textContent);
    const visibleActions=qa(".owner-attention-list > .owner-attention-item",panel).length;
    const needsAction=Number.isFinite(total)?Math.max(0,total-approvals):visibleActions;
    const outcomes=qa(".owner-outcome-loop > .owner-outcome-row",panel).length;
    const totalOpen=needsAction+approvals+outcomes;
    const activeTarget=queueTarget(panel,activeFilter);
    const activeLabel=(FILTERS[activeFilter]?.label||FILTERS.all.label).toLowerCase();
    const oldestAge=oldestQueueAge(panel,activeFilter);
    setMetric(strip,"action",needsAction);
    setMetric(strip,"approvals",approvals);
    setMetric(strip,"outcomes",outcomes);
    if(title)title.textContent=totalOpen===0?"You're clear for now":`${totalOpen} ${totalOpen===1?"item needs":"items need"} your attention`;
    if(next){
      next.disabled=!activeTarget;
      next.setAttribute("aria-label",activeTarget?`Review next ${activeLabel}`:`No ${activeLabel} to review`);
    }
    strip.dataset.state=totalOpen===0?"clear":"ready";
    strip.dataset.openCount=String(totalOpen);
    if(activeFilter!=="all")panel.dataset.ownerFocusFilter=activeFilter;
    updateFilterUi(strip,oldestAge);
  }

  function scheduleSync(){
    if(syncFrame)return;
    syncFrame=global.requestAnimationFrame(()=>{
      syncFrame=0;
      sync();
      bindPanelObserver();
    });
  }

  function bindPanelObserver(){
    const panel=q(`#${ATTENTION_ID}`);
    if(panel===observedPanel&&panelObserver)return;
    if(panelObserver)panelObserver.disconnect();
    panelObserver=null;
    observedPanel=panel||null;
    if(!observedPanel)return;
    panelObserver=new MutationObserver(scheduleSync);
    panelObserver.observe(observedPanel,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["datetime","data-created-at","data-updated-at"]});
  }

  function primeThebeInput(input){
    if(!input)return false;
    if(!String(input.value||"").trim()){
      input.value=FILTERS[activeFilter]?.prompt||FILTERS.all.prompt;
      input.dispatchEvent(new Event("input",{bubbles:true}));
    }
    try{input.focus({preventScroll:true})}catch{input.focus()}
    return true;
  }

  function focusThebe(){
    const dock=q('#thebeAiDock[data-surface="workspace"]')||q("#thebeAiDock");
    const input=dock&&q('textarea,input[type="text"],input:not([type])',dock);
    if(dock)dock.scrollIntoView({behavior:"smooth",block:"nearest"});
    if(primeThebeInput(input))return;
    const pill=q("#thebeAiDockPill");
    if(pill){
      pill.click();
      global.setTimeout(()=>primeThebeInput(q('#thebeAiDock textarea,#thebeAiDock input[type="text"],#thebeAiDock input:not([type])')),120);
      return;
    }
    q("#ownerAgenticPanel")?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function attach(){
    const shell=q(`#${SHELL_ID}`);
    if(!shell)return false;
    ensureStrip();
    bindPanelObserver();
    scheduleSync();
    return true;
  }

  function retryAttach(attempt=0){
    if(attach())return;
    if(attempt>=20)return;
    global.clearTimeout(retryTimer);
    retryTimer=global.setTimeout(()=>retryAttach(attempt+1),150);
  }

  function install(){
    if(document.documentElement.dataset.ownerFocusStrip===RELEASE)return;
    document.documentElement.dataset.ownerFocusStrip=RELEASE;
    retryAttach();
    global.addEventListener("thebe:auth:state",scheduleSync);
    global.addEventListener("thebe:identity:ready",scheduleSync);
    global.addEventListener("thebe:workspace:view",scheduleSync);
    global.ThebeOwnerFocusStrip=Object.freeze({release:RELEASE,sync:scheduleSync,focusThebe,applyFilter,reviewNext});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})(window);