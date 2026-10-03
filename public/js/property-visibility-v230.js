(function(global){
  "use strict";
  const RELEASE="20261001-property-visible-v230";
  const COMPACT_RELEASE="20261003-property-workspace-v262";
  const OPERATIONS_RELEASE="20261003-property-operations-v262";
  const PROPERTY_PANES=new Set(["today","properties","analyse","operations"]);
  let propertyAiPending=false;
  let propertyAiDraft="";
  let compactObserver=null;

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
    for(const node of [layout,calculator])if(node){
      node.style.setProperty("width","100%","important");
      node.style.setProperty("max-width","680px","important");
      node.style.setProperty("min-width","0","important");
      node.style.setProperty("margin-inline","auto","important");
      node.style.setProperty("box-sizing","border-box","important");
    }
    repairNode(view.querySelector(".property-quick-rows"),"grid");
    view.querySelectorAll(".property-input-row").forEach(node=>repairNode(node,"flex"));
    repairNode(view.querySelector(".property-input-pair"),"grid");
    repairNode(analyse,"block");
    const ok=[calculator,price,rent,analyse].every(visible);
    view.dataset.propertyVisibility=ok?"ready":"repairing";
    return ok;
  }

  function parseMoney(value){
    const parsed=Number(String(value??"").replace(/[^0-9.-]/g,""));
    return Number.isFinite(parsed)?Math.max(0,parsed):0;
  }

  function formatPula(value){
    if(!Number.isFinite(value)||value<=0)return "—";
    try{return new Intl.NumberFormat("en-BW",{style:"currency",currency:"BWP",maximumFractionDigits:0}).format(value)}catch(_error){return `P${Math.round(value).toLocaleString()}`}
  }

  function propertySnapshot(){
    const get=id=>String(document.getElementById(id)?.value||"").trim();
    const rawName=get("propertyDealName");
    const name=rawName||"Current property scenario";
    const price=parseMoney(get("propertyPurchasePrice"));
    const rent=parseMoney(get("propertyMonthlyRent"));
    const grossYield=price>0&&rent>0?(rent*12/price)*100:0;
    return {name,hasName:!!rawName,price,rent,grossYield};
  }

  function createMetric(label,className){
    const metric=document.createElement("div");
    metric.className="property-overview-metric-v261";
    const span=document.createElement("span");span.textContent=label;
    const strong=document.createElement("strong");strong.className=className;strong.textContent="—";
    metric.append(span,strong);
    return metric;
  }

  function createOverviewAction(label,pane){
    const button=document.createElement("button");
    button.type="button";
    button.className="property-overview-action-v261";
    button.textContent=label;
    button.addEventListener("click",()=>setPropertyPane(pane,{focus:true}));
    return button;
  }

  function mountPropertyOverview(){
    const view=document.getElementById("propertyintelligence");
    if(!view)return null;
    let overview=view.querySelector(".property-overview-v261");
    if(overview)return overview;
    overview=document.createElement("section");
    overview.className="property-overview-v261";
    overview.dataset.propertyPane="today";
    overview.setAttribute("aria-label","Property overview");

    const yieldCard=document.createElement("div");
    yieldCard.className="property-yield-card-v261";
    const yieldRing=document.createElement("div");yieldRing.className="property-yield-ring-v261";yieldRing.setAttribute("aria-label","Gross annual yield");
    const yieldValue=document.createElement("strong");yieldValue.className="property-yield-value-v261";yieldValue.textContent="—";
    const yieldLabel=document.createElement("span");yieldLabel.textContent="Gross annual yield";
    yieldRing.append(yieldValue);
    yieldCard.append(yieldRing,yieldLabel);

    const summary=document.createElement("div");summary.className="property-overview-summary-v261";
    const heading=document.createElement("div");heading.className="property-overview-heading-v261";
    const copy=document.createElement("div");
    const eyebrow=document.createElement("span");eyebrow.className="property-overview-eyebrow-v261";eyebrow.textContent="LIVE DEAL SNAPSHOT";
    const title=document.createElement("h3");title.className="property-overview-title-v261";title.textContent="Current property scenario";
    copy.append(eyebrow,title);
    const ai=document.createElement("button");ai.type="button";ai.className="property-overview-ai-v261";ai.textContent="Ask Property AI";ai.addEventListener("click",openPropertyAiFromOverview);
    heading.append(copy,ai);

    const metrics=document.createElement("div");metrics.className="property-overview-metrics-v261";
    metrics.append(createMetric("Purchase price","property-overview-price-v261"),createMetric("Monthly rent","property-overview-rent-v261"),createMetric("Annual rent","property-overview-annual-v261"));
    const actions=document.createElement("div");actions.className="property-overview-actions-v261";
    actions.append(createOverviewAction("Properties","properties"),createOverviewAction("Analyse deal","analyse"),createOverviewAction("Operations","operations"));
    summary.append(heading,metrics,actions);
    overview.append(yieldCard,summary);

    const nav=view.querySelector(".property-primary-v260");
    if(nav)nav.insertAdjacentElement("afterend",overview);else view.prepend(overview);
    updatePropertyOverview();
    return overview;
  }

  function updatePropertyOverview(){
    const view=document.getElementById("propertyintelligence");
    const overview=view?.querySelector(".property-overview-v261");
    if(!overview)return;
    const snapshot=propertySnapshot();
    const title=overview.querySelector(".property-overview-title-v261");
    const price=overview.querySelector(".property-overview-price-v261");
    const rent=overview.querySelector(".property-overview-rent-v261");
    const annual=overview.querySelector(".property-overview-annual-v261");
    const yieldValue=overview.querySelector(".property-yield-value-v261");
    const ring=overview.querySelector(".property-yield-ring-v261");
    if(title)title.textContent=snapshot.name;
    if(price)price.textContent=formatPula(snapshot.price);
    if(rent)rent.textContent=formatPula(snapshot.rent);
    if(annual)annual.textContent=formatPula(snapshot.rent*12);
    if(yieldValue)yieldValue.textContent=snapshot.grossYield>0?`${snapshot.grossYield.toFixed(1)}%`:"—";
    if(ring){
      const degrees=Math.max(0,Math.min(360,(snapshot.grossYield/12)*360));
      ring.style.setProperty("--property-yield-angle",`${degrees}deg`);
      ring.setAttribute("aria-label",snapshot.grossYield>0?`Gross annual yield ${snapshot.grossYield.toFixed(1)} percent`:"Gross annual yield unavailable");
    }
  }

  function ensureOperationsStyles(){
    if(document.querySelector('link[data-thebe-property-operations-v262="true"]'))return true;
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="/assets/property-operations-v262.css";
    link.dataset.thebePropertyOperationsV262="true";
    document.head.append(link);
    return true;
  }

  function createOpsMetric(label,className,hint){
    const metric=document.createElement("div");metric.className="property-ops-metric-v262";
    const caption=document.createElement("span");caption.textContent=label;
    const value=document.createElement("strong");value.className=className;value.textContent="—";
    const note=document.createElement("small");note.textContent=hint;
    metric.append(caption,value,note);
    return metric;
  }

  function createOpsQueueItem(title,detail,prompt){
    const item=document.createElement("div");item.className="property-ops-item-v262";
    const copy=document.createElement("div");copy.className="property-ops-item-copy-v262";
    const heading=document.createElement("b");heading.textContent=title;
    const text=document.createElement("span");text.textContent=detail;
    const status=document.createElement("span");status.className="property-ops-status-v262";status.textContent="Connect data";
    copy.append(heading,text,status);
    const button=document.createElement("button");button.type="button";button.className="property-ops-plan-v262";button.textContent="Plan with AI";button.addEventListener("click",()=>openPropertyAiWithPrompt(prompt));
    item.append(copy,button);
    return item;
  }

  function createOpsAction(label,prompt){
    const button=document.createElement("button");
    button.type="button";
    button.className="property-ops-action-v262";
    button.textContent=label;
    button.addEventListener("click",()=>openPropertyAiWithPrompt(prompt));
    return button;
  }

  function mountPropertyOperations(){
    const view=document.getElementById("propertyintelligence");
    if(!view)return null;
    let shell=view.querySelector(".property-operations-v262");
    if(shell)return shell;
    ensureOperationsStyles();
    shell=document.createElement("section");
    shell.className="property-operations-v262";
    shell.dataset.propertyPane="operations";
    shell.dataset.propertyOperationsRelease=OPERATIONS_RELEASE;
    shell.setAttribute("aria-label","Property operations command centre");

    const head=document.createElement("div");head.className="property-ops-head-v262";
    const headCopy=document.createElement("div");headCopy.className="property-ops-head-copy-v262";
    const eyebrow=document.createElement("span");eyebrow.className="property-ops-eyebrow-v262";eyebrow.textContent="OPERATIONS COMMAND CENTRE";
    const title=document.createElement("h3");title.className="property-ops-title-v262";title.textContent="Run the asset after acquisition";
    const note=document.createElement("p");note.className="property-ops-note-v262";note.textContent="Planning view based on the current deal inputs. Tenant, payment, maintenance and expense records are not treated as live until those data sources are connected.";
    headCopy.append(eyebrow,title,note);
    const ai=document.createElement("button");ai.type="button";ai.className="property-ops-ai-v262";ai.textContent="Ask Property AI";ai.addEventListener("click",()=>openPropertyAiWithPrompt("Help me set up operations for this property. Separate what is known from what still needs data."));
    head.append(headCopy,ai);

    const metrics=document.createElement("div");metrics.className="property-ops-metrics-v262";
    metrics.append(
      createOpsMetric("Monthly rent","property-ops-rent-v262","From current deal input"),
      createOpsMetric("Annual rent","property-ops-annual-v262","Calculated from current rent"),
      createOpsMetric("Gross yield","property-ops-yield-v262","Before operating costs"),
      createOpsMetric("Setup readiness","property-ops-setup-v262","Deal-input completeness")
    );

    const grid=document.createElement("div");grid.className="property-ops-grid-v262";
    const readiness=document.createElement("div");readiness.className="property-ops-readiness-v262";
    const ring=document.createElement("div");ring.className="property-ops-ring-v262";ring.setAttribute("aria-label","Operational setup readiness");
    const ringValue=document.createElement("strong");ringValue.className="property-ops-readiness-value-v262";ringValue.textContent="0%";ring.append(ringValue);
    const readinessTitle=document.createElement("b");readinessTitle.textContent="Operational setup";
    const readinessDetail=document.createElement("span");readinessDetail.className="property-ops-readiness-detail-v262";readinessDetail.textContent="Complete the deal name, purchase price and rent inputs first.";
    readiness.append(ring,readinessTitle,readinessDetail);

    const queue=document.createElement("div");queue.className="property-ops-queue-v262";
    queue.append(
      createOpsQueueItem("Lease & tenant","Connect leases, tenants and renewal dates before expiry signals are shown.","Build a lease and tenant onboarding checklist for this property."),
      createOpsQueueItem("Rent collection","Connect payment history before collection or arrears signals are shown.","Create a rent collection workflow for this property, including reminders and escalation steps."),
      createOpsQueueItem("Maintenance","Add open work and recurring maintenance before service alerts are shown.","Create a practical preventive maintenance plan for this property."),
      createOpsQueueItem("Expenses","Add rates, utilities and operating expenses before net-income signals are shown.","Create an operating-expense checklist and monthly tracking structure for this property.")
    );
    grid.append(readiness,queue);

    const actions=document.createElement("div");actions.className="property-ops-actions-v262";
    actions.append(
      createOpsAction("Build lease checklist","Build a concise lease checklist for this property, covering tenant, renewal, deposit and document controls."),
      createOpsAction("Plan rent collection","Design a monthly rent collection routine for this property with reminders, reconciliation and arrears follow-up."),
      createOpsAction("Create maintenance plan","Create a compact preventive maintenance plan for this property, prioritised by risk and frequency.")
    );
    shell.append(head,metrics,grid,actions);

    const valuation=view.querySelector("#propertyValuationServicePanel");
    if(valuation)valuation.insertAdjacentElement("beforebegin",shell);
    else{
      const portfolio=view.querySelector("#propertyPortfolioWorkspace");
      if(portfolio)portfolio.insertAdjacentElement("afterend",shell);else view.append(shell);
    }
    updatePropertyOperations();
    return shell;
  }

  function updatePropertyOperations(){
    const shell=document.querySelector("#propertyintelligence .property-operations-v262");
    if(!shell)return;
    const snapshot=propertySnapshot();
    const set=(selector,value)=>{const node=shell.querySelector(selector);if(node)node.textContent=value};
    set(".property-ops-rent-v262",formatPula(snapshot.rent));
    set(".property-ops-annual-v262",formatPula(snapshot.rent*12));
    set(".property-ops-yield-v262",snapshot.grossYield>0?`${snapshot.grossYield.toFixed(1)}%`:"—");
    const complete=[snapshot.hasName,snapshot.price>0,snapshot.rent>0].filter(Boolean).length;
    const score=Math.round(complete/3*100);
    set(".property-ops-setup-v262",`${score}%`);
    set(".property-ops-readiness-value-v262",`${score}%`);
    set(".property-ops-readiness-detail-v262",score===100?"Deal inputs are ready. Connect live operational records to unlock tenant, collection, maintenance and expense signals.":`${complete}/3 deal inputs complete. Add the missing scenario inputs before operational setup.`);
    const ring=shell.querySelector(".property-ops-ring-v262");
    if(ring){ring.style.setProperty("--property-ops-angle",`${score*3.6}deg`);ring.setAttribute("aria-label",`Operational setup readiness ${score} percent`)}
  }

  function paneTarget(view,pane){
    if(pane==="today")return view?.querySelector(".property-overview-v261");
    return view?.querySelector(`[data-property-pane="${pane}"]`);
  }

  function setPropertyPane(nextPane,options={}){
    const view=document.getElementById("propertyintelligence");
    if(!view)return false;
    const pane=PROPERTY_PANES.has(nextPane)?nextPane:"today";
    view.dataset.propertyActivePane=pane;
    view.querySelectorAll(".property-primary-v260 button[data-property-pane-button]").forEach(button=>{
      const active=button.dataset.propertyPaneButton===pane;
      button.classList.toggle("active",active);
      button.setAttribute("aria-selected",active?"true":"false");
      button.tabIndex=active?0:-1;
    });
    const target=paneTarget(view,pane);
    if(target&&options.focus){
      target.setAttribute("tabindex","-1");
      target.focus({preventScroll:true});
    }
    view.dataset.propertyPaneReady="true";
    return true;
  }

  function compactButton(label,pane){
    const button=document.createElement("button");
    button.type="button";
    button.textContent=label;
    button.dataset.propertyPaneButton=pane;
    button.setAttribute("role","tab");
    button.setAttribute("aria-selected","false");
    button.addEventListener("click",()=>setPropertyPane(pane,{focus:true}));
    button.addEventListener("keydown",event=>{
      if(event.key!=="ArrowRight"&&event.key!=="ArrowLeft")return;
      event.preventDefault();
      const buttons=[...document.querySelectorAll(".property-primary-v260 button[data-property-pane-button]")];
      const current=buttons.indexOf(button);
      const delta=event.key==="ArrowRight"?1:-1;
      buttons[(current+delta+buttons.length)%buttons.length]?.click();
    });
    return button;
  }

  function mountCompactPropertyChrome(){
    const view=document.getElementById("propertyintelligence");
    if(!view)return false;
    view.classList.add("property-compact-v260");
    view.dataset.propertyCompactRelease=COMPACT_RELEASE;
    ensureOperationsStyles();
    if(!view.querySelector(".property-primary-v260")){
      const nav=document.createElement("nav");
      nav.className="property-primary-v260";
      nav.setAttribute("aria-label","Property workspace");
      nav.setAttribute("role","tablist");
      nav.append(compactButton("Today","today"),compactButton("Properties","properties"),compactButton("Analyse","analyse"),compactButton("Operations","operations"));
      const hero=view.querySelector(".property-hero-compact");
      if(hero)hero.insertAdjacentElement("afterend",nav);else view.prepend(nav);
    }
    const calculator=view.querySelector(".property-calculator-v224");
    if(calculator)calculator.dataset.propertyPane="analyse";
    const portfolio=view.querySelector("#propertyPortfolioWorkspace");
    if(portfolio)portfolio.dataset.propertyPane="properties";
    const valuation=view.querySelector("#propertyValuationServicePanel");
    if(valuation)valuation.dataset.propertyPane="operations";
    mountPropertyOverview();
    mountPropertyOperations();
    setPropertyPane(view.dataset.propertyActivePane||"today");
    return true;
  }

  function ensureCompactObserver(){
    const view=document.getElementById("propertyintelligence");
    if(!view||compactObserver)return;
    compactObserver=new MutationObserver(()=>{
      if(!view.classList.contains("active"))return;
      mountCompactPropertyChrome();
    });
    compactObserver.observe(view,{childList:true,subtree:true});
  }

  function propertyPromptSnapshot(){
    const snapshot=propertySnapshot();
    const bits=[snapshot.name];
    if(snapshot.price)bits.push(`purchase price ${formatPula(snapshot.price)}`);
    if(snapshot.rent)bits.push(`monthly rent ${formatPula(snapshot.rent)}`);
    if(snapshot.grossYield)bits.push(`gross annual yield ${snapshot.grossYield.toFixed(1)}%`);
    return bits.join(" · ");
  }

  function clearPropertyAiConversation(){
    const question=document.getElementById("aiAdvisorQuestion");
    const output=document.getElementById("aiAdvisorOutput");
    propertyAiDraft="";
    if(question){question.value="";question.focus()}
    if(output){
      const empty=document.createElement("div");
      empty.className="property-ai-empty-v260";
      const heading=document.createElement("b");heading.textContent="Property AI";
      const detail=document.createElement("span");detail.textContent="Ask about this deal, documents, risk, cash flow or next actions.";
      empty.append(heading,detail);
      output.replaceChildren(empty);
      output.className="copilot-empty";
    }
  }

  function closePropertyAi(){
    document.body.classList.remove("property-ai-fullscreen-v260");
    document.documentElement.removeAttribute("data-property-ai-source");
    propertyAiPending=false;
    propertyAiDraft="";
    if(typeof global.showView==="function")global.showView("propertyintelligence");
  }

  function activatePropertyAiVoice(){
    const candidate=document.querySelector("[data-thebe-voice],#thebeVoiceButton,.thebe-voice-button,[data-bw-onclick*='Voice'],[data-bw-onclick*='voice']");
    if(candidate&&typeof candidate.click==="function"){candidate.click();return}
    document.getElementById("aiAdvisorQuestion")?.focus();
  }

  function mountPropertyAiToolbar(){
    const view=document.getElementById("aiservices");
    if(!view)return false;
    document.body.classList.add("property-ai-fullscreen-v260");
    document.documentElement.dataset.propertyAiSource="property";
    let toolbar=view.querySelector(".property-ai-toolbar-v260");
    if(!toolbar){
      toolbar=document.createElement("header");toolbar.className="property-ai-toolbar-v260";
      const back=document.createElement("button");back.type="button";back.className="property-ai-back-v260";back.textContent="←";back.setAttribute("aria-label","Back to Property");back.addEventListener("click",closePropertyAi);
      const title=document.createElement("div");title.className="property-ai-title-v260";
      const titleName=document.createElement("b");titleName.textContent="Property AI";
      const titleDetail=document.createElement("span");titleDetail.textContent="Grounded in the current Property workspace";
      title.append(titleName,titleDetail);
      const context=document.createElement("button");context.type="button";context.className="property-ai-chip-v260";context.textContent="+ Context";context.addEventListener("click",()=>{const q=document.getElementById("aiAdvisorQuestion");if(q){q.value=`Use this Property context: ${propertyPromptSnapshot()}. `+q.value;q.focus()}});
      const fresh=document.createElement("button");fresh.type="button";fresh.className="property-ai-icon-v260";fresh.textContent="＋";fresh.title="New chat";fresh.setAttribute("aria-label","New Property AI chat");fresh.addEventListener("click",clearPropertyAiConversation);
      const voice=document.createElement("button");voice.type="button";voice.className="property-ai-icon-v260 property-ai-voice-v260";voice.textContent="◉";voice.title="Voice";voice.setAttribute("aria-label","Open voice");voice.addEventListener("click",activatePropertyAiVoice);
      toolbar.append(back,title,context,fresh,voice);
      view.prepend(toolbar);
    }
    const question=document.getElementById("aiAdvisorQuestion");
    if(question){
      question.placeholder="Message Property AI…";
      question.setAttribute("aria-label","Message Property AI");
      if(propertyAiDraft){question.value=`${propertyAiDraft}\n\nProperty context: ${propertyPromptSnapshot()}`;propertyAiDraft=""}
    }
    const mode=document.getElementById("aiAdvisorMode");
    if(mode&&mode.value!=="ask")mode.value="ask";
    global.setTimeout?.(()=>question?.focus(),80);
    return true;
  }

  function openPropertyAiFromOverview(){
    propertyAiPending=true;
    document.documentElement.dataset.propertyAiSource="property";
    if(typeof global.askThebeAboutProperty==="function"){
      global.askThebeAboutProperty();
      global.setTimeout?.(mountPropertyAiToolbar,80);
      return;
    }
    if(typeof global.showView==="function"){
      global.showView("aiservices");
      global.requestAnimationFrame?.(()=>mountPropertyAiToolbar());
      global.setTimeout?.(mountPropertyAiToolbar,80);
    }
  }

  function openPropertyAiWithPrompt(prompt){
    propertyAiDraft=String(prompt||"").trim();
    openPropertyAiFromOverview();
  }

  function markPropertyAiSource(event){
    const trigger=event.target?.closest?.("[data-bw-onclick*='askThebeAboutProperty']");
    if(!trigger)return;
    propertyAiPending=true;
    document.documentElement.dataset.propertyAiSource="property";
  }

  function updatePropertyWorkspace(){
    updatePropertyOverview();
    updatePropertyOperations();
  }

  function schedule(){
    ensurePropertyVisible();
    mountCompactPropertyChrome();
    ensureCompactObserver();
    updatePropertyWorkspace();
    global.requestAnimationFrame?.(()=>global.requestAnimationFrame?.(()=>{ensurePropertyVisible();mountCompactPropertyChrome();updatePropertyWorkspace()}));
    global.setTimeout?.(()=>{ensurePropertyVisible();mountCompactPropertyChrome();updatePropertyWorkspace()},180);
    global.setTimeout?.(()=>{ensurePropertyVisible();mountCompactPropertyChrome();updatePropertyWorkspace()},600);
  }

  document.addEventListener("click",markPropertyAiSource,true);
  document.addEventListener("input",event=>{
    if(event.target?.closest?.("#propertyintelligence"))updatePropertyWorkspace();
  },true);
  document.addEventListener("change",event=>{
    if(event.target?.closest?.("#propertyintelligence"))updatePropertyWorkspace();
  },true);
  global.addEventListener("thebe:workspace-view-change",event=>{
    const id=String(event?.detail?.id||"");
    if(id==="propertyintelligence"){
      document.body.classList.remove("property-ai-fullscreen-v260");
      schedule();
      return;
    }
    if(id==="aiservices"&&(propertyAiPending||document.documentElement.dataset.propertyAiSource==="property")){
      global.requestAnimationFrame?.(()=>mountPropertyAiToolbar());
      global.setTimeout?.(mountPropertyAiToolbar,80);
      return;
    }
    if(id!=="aiservices")document.body.classList.remove("property-ai-fullscreen-v260");
  });
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",schedule,{once:true});else schedule();
  global.ThebePropertyVisibility=Object.freeze({
    release:RELEASE,
    compactRelease:COMPACT_RELEASE,
    operationsRelease:OPERATIONS_RELEASE,
    repair:ensurePropertyVisible,
    mount:mountCompactPropertyChrome,
    setPane:setPropertyPane,
    updateOverview:updatePropertyOverview,
    updateOperations:updatePropertyOperations,
    openAi:()=>{propertyAiPending=true;return mountPropertyAiToolbar()},
    openAiWithPrompt:openPropertyAiWithPrompt,
    closeAi:closePropertyAi,
    state:()=>({ready:ensurePropertyVisible(),compact:!!document.getElementById("propertyintelligence")?.classList.contains("property-compact-v260"),pane:document.getElementById("propertyintelligence")?.dataset.propertyActivePane||"today",operationsMounted:!!document.querySelector("#propertyintelligence .property-operations-v262"),aiFullscreen:document.body.classList.contains("property-ai-fullscreen-v260")})
  });
})(window);