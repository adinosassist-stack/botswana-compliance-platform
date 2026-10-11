(function installOwnerFocusV3(global){
  "use strict";

  const RELEASE="20261011-owner-focus-canonical-v326";
  const PRIOR_RECOVERY_RELEASE="20261011-owner-focus-recovery-v322";
  const PRIOR_RELEASE="20261007-owner-focus-v3-v303";
  const STRIP_ID="ownerFocusStrip";
  const STYLE_ID="ownerFocusStripStyle";
  const ATTENTION_ID="ownerAttentionPanel";
  const SHELL_ID="ownerCommandCentre";
  const CANONICAL_TTL_MS=1500;
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
  let canonicalTimer=0;
  let syncFrame=0;
  let activeFilter="all";
  let queueRetryBusy=false;
  let canonicalBusy=false;
  let canonicalPromise=null;
  let canonicalSnapshot=null;
  let canonicalFetchedAt=0;
  let canonicalSeq=0;
  let lastReadyAt=0;

  function installStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    const nonce=document.querySelector("style[nonce],script[nonce]")?.nonce;
    if(nonce)style.nonce=nonce;
    style.dataset.release=RELEASE;
    style.textContent=`
#${STRIP_ID}{display:grid;grid-template-columns:minmax(170px,.95fr) repeat(3,minmax(112px,1fr)) auto auto auto;gap:10px;align-items:stretch;margin:14px 0 18px;padding:10px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:18px;background:color-mix(in srgb,var(--surface,#fff) 92%,transparent);box-shadow:0 10px 28px rgba(15,23,42,.06)}
#${STRIP_ID} .owner-focus-intro{display:flex;flex-direction:column;justify-content:center;padding:2px 8px;min-width:0}
#${STRIP_ID} .owner-focus-kicker{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.6}
#${STRIP_ID} .owner-focus-title{font-size:14px;font-weight:800;line-height:1.2;margin-top:3px}
#${STRIP_ID} .owner-focus-state{display:flex;align-items:center;gap:7px;min-width:0;margin-top:5px;font-size:10px;font-weight:700;opacity:.68}
#${STRIP_ID} .owner-focus-state span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${STRIP_ID} .owner-focus-clear{appearance:none;border:0;background:transparent;color:inherit;padding:0;text-decoration:underline;text-underline-offset:2px;font:inherit;font-weight:800;cursor:pointer}
#${STRIP_ID} .owner-focus-clear[hidden],#${STRIP_ID} .owner-focus-retry[hidden]{display:none!important}
#${STRIP_ID} .owner-focus-metric{appearance:none;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:14px;background:color-mix(in srgb,var(--surface,#fff) 96%,transparent);padding:10px 12px;text-align:left;cursor:pointer;color:inherit;min-width:0;transition:border-color .16s ease,transform .16s ease,background .16s ease}
#${STRIP_ID} .owner-focus-metric:hover{border-color:color-mix(in srgb,currentColor 24%,transparent);transform:translateY(-1px)}
#${STRIP_ID} .owner-focus-metric[aria-pressed="true"]{border-color:color-mix(in srgb,currentColor 38%,transparent);background:color-mix(in srgb,var(--surface,#fff) 86%,currentColor 6%)}
#${STRIP_ID} .owner-focus-value{display:block;font-size:20px;font-weight:850;line-height:1}
#${STRIP_ID} .owner-focus-label{display:block;margin-top:5px;font-size:11px;font-weight:700;opacity:.66;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${STRIP_ID} .owner-focus-next,#${STRIP_ID} .owner-focus-retry,#${STRIP_ID} .owner-focus-ask{border-radius:14px;padding:0 14px;font:inherit;font-weight:800;cursor:pointer;white-space:nowrap;min-height:44px}
#${STRIP_ID} .owner-focus-next,#${STRIP_ID} .owner-focus-retry{border:1px solid color-mix(in srgb,currentColor 18%,transparent);background:color-mix(in srgb,var(--surface,#fff) 96%,transparent);color:inherit}
#${STRIP_ID} .owner-focus-retry{border-color:#b42318;color:#8f1d16;background:#fff4f2}
#${STRIP_ID} .owner-focus-ask{border:0;background:#111827;color:#fff}
#${STRIP_ID} .owner-focus-next:hover,#${STRIP_ID} .owner-focus-retry:hover{border-color:color-mix(in srgb,currentColor 34%,transparent)}
#${STRIP_ID} .owner-focus-ask:hover{filter:brightness(1.08)}
#${STRIP_ID} .owner-focus-next:disabled,#${STRIP_ID} .owner-focus-retry:disabled{opacity:.45;cursor:default}
#${STRIP_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
#${ATTENTION_ID}[data-owner-focus-filter="action"] .owner-review-inbox,
#${ATTENTION_ID}[data-owner-focus-filter="action"] .owner-outcome-loop{display:none!important}
#${ATTENTION_ID}[data-owner-focus-filter="approvals"] .owner-attention-list,
#${ATTENTION_ID}[data-owner-focus-filter="approvals"] .owner-outcome-loop{display:none!important}
#${ATTENTION_ID}[data-owner-focus-filter="outcomes"] .owner-review-inbox,
#${ATTENTION_ID}[data-owner-focus-filter="outcomes"] .owner-attention-list,
#${ATTENTION_ID}[data-owner-focus-filter="outcomes"] .owner-outcome-history{display:none!important}
@media(max-width:1050px){#${STRIP_ID}{grid-template-columns:1fr 1fr 1fr}#${STRIP_ID} .owner-focus-intro{grid-column:1/-1;padding:3px 4px 1px}#${STRIP_ID} .owner-focus-next,#${STRIP_ID} .owner-focus-retry,#${STRIP_ID} .owner-focus-ask{grid-column:auto}}
@media(max-width:760px){#${STRIP_ID}{margin:12px 0 16px}#${STRIP_ID} .owner-focus-metric{padding:9px 10px}#${STRIP_ID} .owner-focus-value{font-size:18px}}
@media(max-width:410px){#${STRIP_ID}{gap:7px;padding:8px;border-radius:16px}#${STRIP_ID} .owner-focus-label{font-size:10px}#${STRIP_ID} .owner-focus-value{font-size:17px}#${STRIP_ID} .owner-focus-next,#${STRIP_ID} .owner-focus-retry,#${STRIP_ID} .owner-focus-ask{grid-column:1/-1}}
@media(prefers-reduced-motion:reduce){#${STRIP_ID} .owner-focus-metric{transition:none}#${STRIP_ID} .owner-focus-metric:hover{transform:none}}
@media(forced-colors:active){#${STRIP_ID},#${STRIP_ID} .owner-focus-metric,#${STRIP_ID} .owner-focus-next,#${STRIP_ID} .owner-focus-retry,#${STRIP_ID} .owner-focus-ask{border:1px solid ButtonText}#${STRIP_ID} :focus-visible{outline:3px solid Highlight;box-shadow:none}}
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
    strip.dataset.priorRelease=PRIOR_RECOVERY_RELEASE;
    strip.dataset.originalRelease=PRIOR_RELEASE;
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

    const retry=document.createElement("button");
    retry.type="button";
    retry.className="owner-focus-retry";
    retry.textContent="Retry priorities";
    retry.hidden=true;
    retry.setAttribute("aria-controls",ATTENTION_ID);
    retry.addEventListener("click",retryPriorities);

    const ask=document.createElement("button");
    ask.type="button";
    ask.className="owner-focus-ask";
    ask.textContent="Ask Thebe";
    ask.addEventListener("click",focusThebe);
    strip.append(intro,metric("Needs action","action"),metric("Approvals","approvals"),metric("Pending outcomes","outcomes"),next,retry,ask);

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

  function knownCount(value){
    const n=Number(value);
    return Number.isFinite(n)&&n>=0?Math.floor(n):null;
  }

  function displayCount(value){
    return value==null?"—":String(value);
  }

  function sourceReason(result){
    if(result?.status==="fulfilled")return null;
    return String(result?.reason?.message||result?.reason||"source_unavailable").replace(/\s+/g," ").slice(0,160);
  }

  function buildCanonicalSnapshot(dailyResult,runsResult,outcomesResult,businessResult){
    const dailyAvailable=dailyResult?.status==="fulfilled";
    const runsAvailable=runsResult?.status==="fulfilled";
    const outcomesAvailable=outcomesResult?.status==="fulfilled";
    const businessAvailable=businessResult?.status==="fulfilled";
    const daily=dailyAvailable?(dailyResult.value||{}):{};
    const runs=runsAvailable?(runsResult.value||{}):{};
    const outcomes=outcomesAvailable?(outcomesResult.value||{}):{};
    const business=businessAvailable?(businessResult.value||{}):{};
    const proposals=Array.isArray(runs?.proposals)?runs.proposals:[];
    const recordedOutcomes=Array.isArray(outcomes?.items)?outcomes.items:[];
    const measured=new Set(recordedOutcomes.map(item=>String(item?.proposal_id||item?.proposalId||"")).filter(Boolean));
    const action=dailyAvailable?(knownCount(daily?.status?.openWork)??(Array.isArray(daily?.topActions)?daily.topActions.length:0)):null;
    const approvals=runsAvailable?proposals.filter(item=>String(item?.status||"pending")==="pending").length:null;
    const pendingOutcomes=runsAvailable&&outcomesAvailable
      ?proposals.filter(item=>String(item?.status||"pending")!=="pending"&&!measured.has(String(item?.id||""))).length
      :null;
    const priorities=business?.brief?.priorities||business?.priorities;
    const recommendations=businessAvailable&&Array.isArray(priorities)?priorities.length:(businessAvailable?0:null);
    const authoritativeKnown=[action,approvals,pendingOutcomes].every(value=>value!==null);
    return Object.freeze({
      version:"2026-10-11.owner-focus-canonical-v1",
      state:authoritativeKnown?"ready":"unavailable",
      generatedAt:String(daily?.generatedAt||business?.observedAt||new Date().toISOString()),
      businessDate:String(daily?.date||business?.businessDate||"")||null,
      counts:Object.freeze({
        action,
        approvals,
        outcomes:pendingOutcomes,
        recommendations,
        total:authoritativeKnown?action+approvals+pendingOutcomes:null
      }),
      sourceAvailability:Object.freeze({
        dailyBrief:Object.freeze({available:dailyAvailable,reason:sourceReason(dailyResult)}),
        agenticRuns:Object.freeze({available:runsAvailable,reason:sourceReason(runsResult)}),
        agenticOutcomes:Object.freeze({available:outcomesAvailable,reason:sourceReason(outcomesResult)}),
        businessContext:Object.freeze({available:businessAvailable,reason:sourceReason(businessResult),authoritativeForCounts:false})
      }),
      provenance:Object.freeze({
        authority:"authenticated_backend_records",
        action:"/api/daily-brief status.openWork",
        approvals:"/api/agentic/runs pending proposals",
        outcomes:"/api/agentic/runs non-pending proposals without /api/agentic/outcomes record",
        recommendations:"/api/business-context/brief priorities (non-authoritative)",
        rule:"DOM rows are navigation/rendering evidence only and never define canonical Owner Focus counts."
      })
    });
  }

  async function refreshCanonicalSnapshot({force=false}={}){
    if(canonicalBusy&&canonicalPromise)return canonicalPromise;
    if(!force&&canonicalSnapshot&&Date.now()-canonicalFetchedAt<CANONICAL_TTL_MS)return canonicalSnapshot;
    const seq=++canonicalSeq;
    canonicalBusy=true;
    scheduleSync();
    canonicalPromise=(async()=>{
      if(typeof global.apiJson!=="function"){
        canonicalSnapshot=buildCanonicalSnapshot(
          {status:"rejected",reason:new Error("secure_api_transport_unavailable")},
          {status:"rejected",reason:new Error("secure_api_transport_unavailable")},
          {status:"rejected",reason:new Error("secure_api_transport_unavailable")},
          {status:"rejected",reason:new Error("secure_api_transport_unavailable")}
        );
        canonicalFetchedAt=Date.now();
        return canonicalSnapshot;
      }
      const results=await Promise.allSettled([
        global.apiJson("/api/daily-brief"),
        global.apiJson("/api/agentic/runs"),
        global.apiJson("/api/agentic/outcomes"),
        global.apiJson("/api/business-context/brief")
      ]);
      if(seq!==canonicalSeq)return canonicalSnapshot;
      canonicalSnapshot=buildCanonicalSnapshot(results[0],results[1],results[2],results[3]);
      canonicalFetchedAt=Date.now();
      return canonicalSnapshot;
    })().finally(()=>{
      if(seq===canonicalSeq){
        canonicalBusy=false;
        canonicalPromise=null;
        scheduleSync();
      }
    });
    return canonicalPromise;
  }

  function scheduleCanonicalRefresh({force=false}={}){
    if(!force&&canonicalSnapshot&&Date.now()-canonicalFetchedAt<CANONICAL_TTL_MS)return;
    global.clearTimeout(canonicalTimer);
    canonicalTimer=global.setTimeout(()=>{refreshCanonicalSnapshot({force}).catch(()=>{});},90);
  }

  async function retryPriorities(){
    if(queueRetryBusy)return;
    const strip=ensureStrip(),panel=q(`#${ATTENTION_ID}`),retry=strip&&q(".owner-focus-retry",strip),title=strip&&q("[data-owner-focus-title]",strip);
    const refresh=global.ThebeOwnerCommandCentre?.refresh;
    if(typeof refresh!=="function"){
      if(title)title.textContent="Priority retry unavailable";
      return;
    }
    queueRetryBusy=true;
    if(retry){retry.disabled=true;retry.textContent="Retrying…"}
    if(title)title.textContent="Retrying priority queue…";
    if(panel)panel.dataset.ownerFocusRetry="true";
    try{
      await Promise.resolve(refresh());
      await refreshCanonicalSnapshot({force:true});
    }catch{
      if(title)title.textContent="Priority queue unavailable";
    }finally{
      queueRetryBusy=false;
      if(retry){retry.disabled=false;retry.textContent="Retry priorities"}
      if(panel)delete panel.dataset.ownerFocusRetry;
      scheduleSync();
    }
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
    const panelUnavailable=/priority queue unavailable/i.test(panel.textContent||"");
    const loading=/priority queue loading/i.test(panel.textContent||"")||panel.dataset.ownerFocusRetry==="true"||(canonicalBusy&&!canonicalSnapshot);
    const title=q("[data-owner-focus-title]",strip);
    const next=q(".owner-focus-next",strip);
    const retry=q(".owner-focus-retry",strip);
    const activeTarget=queueTarget(panel,activeFilter);
    const activeLabel=(FILTERS[activeFilter]?.label||FILTERS.all.label).toLowerCase();
    const oldestAge=oldestQueueAge(panel,activeFilter);
    const counts=canonicalSnapshot?.counts||{};

    setMetric(strip,"action",displayCount(counts.action));
    setMetric(strip,"approvals",displayCount(counts.approvals));
    setMetric(strip,"outcomes",displayCount(counts.outcomes));

    if(loading){
      if(title)title.textContent="Loading priorities…";
      if(next){next.disabled=true;next.setAttribute("aria-label","Priority queue loading")}
      if(retry){
        retry.hidden=loading;
        retry.disabled=queueRetryBusy;
        retry.setAttribute("aria-label","Retry priority queue without changing approval or execution authority");
      }
      strip.dataset.state="loading";
      updateFilterUi(strip,oldestAge);
      return;
    }

    const canonicalUnavailable=!canonicalSnapshot||canonicalSnapshot.state!=="ready";
    if(canonicalUnavailable){
      if(title)title.textContent="Priority data incomplete — retry to verify";
      if(next){
        next.disabled=!activeTarget;
        next.setAttribute("aria-label",activeTarget?`Review next ${activeLabel}`:`No ${activeLabel} to review`);
      }
      if(retry){
        retry.hidden=false;
        retry.disabled=queueRetryBusy;
        retry.setAttribute("aria-label","Retry priority queue without changing approval or execution authority");
      }
      strip.dataset.state="unavailable";
      delete strip.dataset.openCount;
      updateFilterUi(strip,oldestAge);
      return;
    }

    const totalOpen=Number(counts.total||0);
    if(title)title.textContent=totalOpen===0?"You're clear for now":`${totalOpen} ${totalOpen===1?"item needs":"items need"} your attention`;
    if(next){
      next.disabled=!activeTarget;
      next.setAttribute("aria-label",activeTarget?`Review next ${activeLabel}`:`No ${activeLabel} to review`);
    }
    if(retry){
      retry.hidden=panelUnavailable?false:true;
      if(!panelUnavailable)retry.hidden=true;
      retry.disabled=queueRetryBusy;
    }
    lastReadyAt=Date.now();
    strip.dataset.lastReadyAt=String(lastReadyAt);
    strip.dataset.state=panelUnavailable?"render-unavailable":(totalOpen===0?"clear":"ready");
    strip.dataset.openCount=String(totalOpen);
    strip.dataset.canonicalVersion=String(canonicalSnapshot.version||"");
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
    panelObserver=new MutationObserver(()=>{
      scheduleSync();
      scheduleCanonicalRefresh();
    });
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
    scheduleCanonicalRefresh({force:true});
    return true;
  }

  function retryAttach(attempt=0){
    if(attach())return;
    if(attempt>=20)return;
    global.clearTimeout(retryTimer);
    retryTimer=global.setTimeout(()=>retryAttach(attempt+1),150);
  }

  function refreshFromContext(){
    scheduleSync();
    scheduleCanonicalRefresh({force:true});
  }

  function install(){
    if(document.documentElement.dataset.ownerFocusStrip===RELEASE)return;
    document.documentElement.dataset.ownerFocusStrip=RELEASE;
    retryAttach();
    global.addEventListener("thebe:auth:state",refreshFromContext);
    global.addEventListener("thebe:identity:ready",refreshFromContext);
    global.addEventListener("thebe:workspace:view",refreshFromContext);
    global.ThebeOwnerFocusStrip=Object.freeze({
      release:RELEASE,
      sync:scheduleSync,
      refreshCanonical:refreshCanonicalSnapshot,
      canonicalSnapshot:()=>canonicalSnapshot,
      focusThebe,
      applyFilter,
      reviewNext,
      retryPriorities,
      lastReadyAt:()=>lastReadyAt
    });
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})(window);
