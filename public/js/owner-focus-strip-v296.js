(function installOwnerFocusV2(global){
  "use strict";

  const RELEASE="20261007-owner-focus-v2-v296";
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
#${STRIP_ID}{display:grid;grid-template-columns:minmax(150px,.9fr) repeat(3,minmax(112px,1fr)) auto;gap:10px;align-items:stretch;margin:14px 0 18px;padding:10px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:18px;background:color-mix(in srgb,var(--surface,#fff) 92%,transparent);box-shadow:0 10px 28px rgba(15,23,42,.06)}
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
#${STRIP_ID} .owner-focus-ask{border:0;border-radius:14px;padding:0 16px;font:inherit;font-weight:800;cursor:pointer;background:#111827;color:#fff;white-space:nowrap}
#${STRIP_ID} .owner-focus-ask:hover{filter:brightness(1.08)}
#${STRIP_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #075985}
#${ATTENTION_ID}[data-owner-focus-filter="action"] .owner-review-inbox,
#${ATTENTION_ID}[data-owner-focus-filter="action"] .owner-outcome-loop{display:none!important}
#${ATTENTION_ID}[data-owner-focus-filter="approvals"] .owner-attention-list,
#${ATTENTION_ID}[data-owner-focus-filter="approvals"] .owner-outcome-loop{display:none!important}
#${ATTENTION_ID}[data-owner-focus-filter="outcomes"] .owner-review-inbox,
#${ATTENTION_ID}[data-owner-focus-filter="outcomes"] .owner-attention-list,
#${ATTENTION_ID}[data-owner-focus-filter="outcomes"] .owner-outcome-history{display:none!important}
@media(max-width:760px){#${STRIP_ID}{grid-template-columns:1fr 1fr 1fr;margin:12px 0 16px}#${STRIP_ID} .owner-focus-intro{grid-column:1/-1;padding:3px 4px 1px}#${STRIP_ID} .owner-focus-ask{grid-column:1/-1;min-height:44px}#${STRIP_ID} .owner-focus-metric{padding:9px 10px}#${STRIP_ID} .owner-focus-value{font-size:18px}}
@media(max-width:410px){#${STRIP_ID}{gap:7px;padding:8px;border-radius:16px}#${STRIP_ID} .owner-focus-label{font-size:10px}#${STRIP_ID} .owner-focus-value{font-size:17px}}
@media(prefers-reduced-motion:reduce){#${STRIP_ID} .owner-focus-metric{transition:none}#${STRIP_ID} .owner-focus-metric:hover{transform:none}}
@media(forced-colors:active){#${STRIP_ID},#${STRIP_ID} .owner-focus-metric,#${STRIP_ID} .owner-focus-ask{border:1px solid ButtonText}#${STRIP_ID} :focus-visible{outline:3px solid Highlight;box-shadow:none}}
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
    const kicker=document.createElement("span");
    kicker.className="owner-focus-kicker";
    kicker.textContent="Owner focus";
    const title=document.createElement("span");
    title.className="owner-focus-title";
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

    const ask=document.createElement("button");
    ask.type="button";
    ask.className="owner-focus-ask";
    ask.textContent="Ask Thebe";
    ask.addEventListener("click",focusThebe);
    strip.append(intro,metric("Needs action","action"),metric("Approvals","approvals"),metric("Pending outcomes","outcomes"),ask);

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

  function updateFilterUi(strip=ensureStrip()){
    if(!strip)return;
    strip.dataset.filter=activeFilter;
    qa("[data-focus-metric]",strip).forEach(node=>node.setAttribute("aria-pressed",String(node.dataset.focusMetric===activeFilter)));
    const state=q("[data-owner-focus-state]",strip);
    if(state)state.textContent=FILTERS[activeFilter]?.label||FILTERS.all.label;
    const clear=q(".owner-focus-clear",strip);
    if(clear)clear.hidden=activeFilter==="all";
  }

  function queueTarget(panel,key){
    if(!panel)return null;
    if(key==="approvals")return q(".owner-review-inbox .owner-review-row",panel);
    if(key==="outcomes")return q(".owner-outcome-loop .owner-outcome-row",panel);
    if(key==="action")return q(".owner-attention-list .owner-attention-item",panel);
    return q(".owner-review-inbox .owner-review-row,.owner-attention-list .owner-attention-item,.owner-outcome-loop .owner-outcome-row",panel);
  }

  function applyFilter(key,{focus=false}={}){
    activeFilter=FILTERS[key]?key:"all";
    const panel=q(`#${ATTENTION_ID}`);
    if(panel){
      if(activeFilter==="all")delete panel.dataset.ownerFocusFilter;
      else panel.dataset.ownerFocusFilter=activeFilter;
    }
    updateFilterUi();
    if(!focus||!panel)return;
    panel.scrollIntoView({behavior:"smooth",block:"start"});
    const target=queueTarget(panel,activeFilter);
    if(target){
      if(!target.hasAttribute("tabindex"))target.setAttribute("tabindex","-1");
      try{target.focus({preventScroll:true})}catch{target.focus()}
    }
  }

  function sync(){
    const strip=ensureStrip();
    const panel=q(`#${ATTENTION_ID}`);
    if(!strip||!panel)return;
    const unavailable=/priority queue unavailable/i.test(panel.textContent||"");
    if(unavailable){
      setMetric(strip,"action","—");
      setMetric(strip,"approvals","—");
      setMetric(strip,"outcomes","—");
      strip.dataset.state="unavailable";
      return;
    }
    const approvals=qa(".owner-review-inbox > .owner-review-row",panel).length;
    const total=Number(q(".owner-panel-head .badge",panel)?.textContent);
    const visibleActions=qa(".owner-attention-list > .owner-attention-item",panel).length;
    const needsAction=Number.isFinite(total)?Math.max(0,total-approvals):visibleActions;
    const outcomes=qa(".owner-outcome-loop > .owner-outcome-row",panel).length;
    setMetric(strip,"action",needsAction);
    setMetric(strip,"approvals",approvals);
    setMetric(strip,"outcomes",outcomes);
    strip.dataset.state="ready";
    if(activeFilter!=="all")panel.dataset.ownerFocusFilter=activeFilter;
    updateFilterUi(strip);
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
    panelObserver.observe(observedPanel,{childList:true,subtree:true,characterData:true});
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
    global.ThebeOwnerFocusStrip=Object.freeze({release:RELEASE,sync:scheduleSync,focusThebe,applyFilter});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})(window);
