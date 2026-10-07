(function installOwnerFocusStrip(global){
  "use strict";

  const RELEASE="20261007-owner-focus-strip-v295";
  const STRIP_ID="ownerFocusStrip";
  const STYLE_ID="ownerFocusStripStyle";
  const ATTENTION_ID="ownerAttentionPanel";

  const q=(selector,root=document)=>root.querySelector(selector);
  const qa=(selector,root=document)=>Array.from(root.querySelectorAll(selector));

  function installStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    style.dataset.release=RELEASE;
    style.textContent=`
#${STRIP_ID}{display:grid;grid-template-columns:minmax(120px,.8fr) repeat(3,minmax(104px,1fr)) auto;gap:10px;align-items:stretch;margin:14px 0 18px;padding:10px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:18px;background:color-mix(in srgb,var(--surface,#fff) 92%,transparent);box-shadow:0 10px 28px rgba(15,23,42,.06)}
#${STRIP_ID} .owner-focus-intro{display:flex;flex-direction:column;justify-content:center;padding:2px 8px;min-width:0}
#${STRIP_ID} .owner-focus-kicker{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.6}
#${STRIP_ID} .owner-focus-title{font-size:14px;font-weight:800;line-height:1.2;margin-top:3px}
#${STRIP_ID} .owner-focus-metric{appearance:none;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:14px;background:color-mix(in srgb,var(--surface,#fff) 96%,transparent);padding:10px 12px;text-align:left;cursor:pointer;color:inherit;min-width:0}
#${STRIP_ID} .owner-focus-metric:hover{border-color:color-mix(in srgb,currentColor 24%,transparent);transform:translateY(-1px)}
#${STRIP_ID} .owner-focus-value{display:block;font-size:20px;font-weight:850;line-height:1}
#${STRIP_ID} .owner-focus-label{display:block;margin-top:5px;font-size:11px;font-weight:700;opacity:.66;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${STRIP_ID} .owner-focus-ask{border:0;border-radius:14px;padding:0 16px;font:inherit;font-weight:800;cursor:pointer;background:#111827;color:#fff;white-space:nowrap}
#${STRIP_ID} .owner-focus-ask:hover{filter:brightness(1.08)}
#${STRIP_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #075985}
@media(max-width:760px){#${STRIP_ID}{grid-template-columns:1fr 1fr 1fr;margin:12px 0 16px}#${STRIP_ID} .owner-focus-intro{grid-column:1/-1;padding:3px 4px 1px}#${STRIP_ID} .owner-focus-ask{grid-column:1/-1;min-height:44px}#${STRIP_ID} .owner-focus-metric{padding:9px 10px}#${STRIP_ID} .owner-focus-value{font-size:18px}}
@media(max-width:410px){#${STRIP_ID}{gap:7px;padding:8px;border-radius:16px}#${STRIP_ID} .owner-focus-label{font-size:10px}#${STRIP_ID} .owner-focus-value{font-size:17px}}
@media(forced-colors:active){#${STRIP_ID},#${STRIP_ID} .owner-focus-metric,#${STRIP_ID} .owner-focus-ask{border:1px solid ButtonText}#${STRIP_ID} :focus-visible{outline:3px solid Highlight;box-shadow:none}}
`;
    document.head.append(style);
  }

  function metric(label,key){
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="owner-focus-metric";
    btn.dataset.focusMetric=key;
    const value=document.createElement("span");
    value.className="owner-focus-value";
    value.textContent="—";
    const caption=document.createElement("span");
    caption.className="owner-focus-label";
    caption.textContent=label;
    btn.append(value,caption);
    btn.addEventListener("click",()=>q(`#${ATTENTION_ID}`)?.scrollIntoView({behavior:"smooth",block:"start"}));
    return btn;
  }

  function ensureStrip(){
    const shell=q("#ownerCommandCentre");
    if(!shell)return null;
    let strip=q(`#${STRIP_ID}`,shell);
    if(strip)return strip;
    installStyle();
    strip=document.createElement("section");
    strip.id=STRIP_ID;
    strip.className="owner-focus-strip";
    strip.dataset.release=RELEASE;
    strip.setAttribute("aria-label","Owner focus");

    const intro=document.createElement("div");
    intro.className="owner-focus-intro";
    const kicker=document.createElement("span");
    kicker.className="owner-focus-kicker";
    kicker.textContent="Owner focus";
    const title=document.createElement("span");
    title.className="owner-focus-title";
    title.textContent="Decide what matters next";
    intro.append(kicker,title);

    const ask=document.createElement("button");
    ask.type="button";
    ask.className="owner-focus-ask";
    ask.textContent="Ask Thebe";
    ask.addEventListener("click",focusThebe);
    strip.append(intro,metric("Needs action","action"),metric("Approvals","approvals"),metric("Pending outcomes","outcomes"),ask);

    const head=q(".owner-command-head",shell);
    if(head)head.insertAdjacentElement("afterend",strip);else shell.prepend(strip);
    return strip;
  }

  function setMetric(strip,key,value){
    const node=q(`[data-focus-metric="${key}"] .owner-focus-value`,strip);
    const next=String(value);
    if(node&&node.textContent!==next)node.textContent=next;
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
    setMetric(strip,"action",needsAction);
    setMetric(strip,"approvals",approvals);
    setMetric(strip,"outcomes",qa(".owner-outcome-loop > .owner-outcome-row",panel).length);
    strip.dataset.state="ready";
  }

  function focusThebe(){
    const dock=q('#thebeAiDock[data-surface="workspace"]')||q("#thebeAiDock");
    const input=dock&&q('textarea,input[type="text"],input:not([type])',dock);
    if(dock)dock.scrollIntoView({behavior:"smooth",block:"nearest"});
    if(input){
      try{input.focus({preventScroll:true})}catch{input.focus()}
      return;
    }
    const pill=q("#thebeAiDockPill");
    if(pill){
      pill.click();
      setTimeout(()=>q('#thebeAiDock textarea,#thebeAiDock input[type="text"],#thebeAiDock input:not([type])')?.focus(),120);
      return;
    }
    q("#ownerAgenticPanel")?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function install(){
    if(document.documentElement.dataset.ownerFocusStrip===RELEASE)return;
    document.documentElement.dataset.ownerFocusStrip=RELEASE;
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    sync();
    global.addEventListener("thebe:auth:state",sync);
    global.addEventListener("thebe:identity:ready",sync);
    global.ThebeOwnerFocusStrip=Object.freeze({release:RELEASE,sync,focusThebe});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})(window);
