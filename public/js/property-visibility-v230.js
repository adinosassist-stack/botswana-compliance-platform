(function(global){
  "use strict";
  const RELEASE="20261001-property-visible-v230";
  const COMPACT_RELEASE="20261003-property-workspace-v272";
  const OPERATIONS_RELEASE="20261003-property-operations-v262";
  const OPTIMISE_RELEASE="20261003-property-optimise-v263";
  const COMPARE_RELEASE="20261003-property-compare-v264";
  const PROPERTY_PANES=new Set(["today","properties","analyse","operations","optimise","compare"]);
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
    if(view.dataset.propertyActivePane&&view.dataset.propertyActivePane!=="analyse"){
      const target=paneTarget(view,view.dataset.propertyActivePane);
      const ok=visible(target);
      view.dataset.propertyVisibility=ok?"ready":"repairing";
      return ok;
    }
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

  function formatSignedPula(value){
    if(!Number.isFinite(value))return "—";
    try{return new Intl.NumberFormat("en-BW",{style:"currency",currency:"BWP",maximumFractionDigits:0,signDisplay:"exceptZero"}).format(value)}catch(_error){const rounded=Math.round(value);return `${rounded>0?"+":""}P${rounded.toLocaleString()}`}
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
    actions.append(createOverviewAction("Properties","properties"),createOverviewAction("Analyse deal","analyse"),createOverviewAction("Operations","operations"),createOverviewAction("Compare","compare"));
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

  function propertyAssetUrl(path){
    const release=document.querySelector('meta[name="thebe-assets-release"]')?.content||"";
    return /^[0-9a-f]{40}$/.test(release)?`${path}?release=${release}`:path;
  }

  function ensureOperationsStyles(){
    if(document.querySelector('link[data-thebe-property-operations-v262="true"]'))return true;
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href=propertyAssetUrl("/assets/property-operations-v262.css");
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

  function ensureOptimiseStyles(){
    if(document.querySelector('link[data-thebe-property-optimise-v263="true"]'))return true;
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href=propertyAssetUrl("/assets/property-optimise-v263.css");
    link.dataset.thebePropertyOptimiseV263="true";
    document.head.append(link);
    return true;
  }

  function createOptMetric(label,className,hint){
    const metric=document.createElement("div");metric.className="property-opt-metric-v263";
    const caption=document.createElement("span");caption.textContent=label;
    const value=document.createElement("strong");value.className=className;value.textContent="—";
    const note=document.createElement("small");note.textContent=hint;
    metric.append(caption,value,note);
    return metric;
  }

  function createOptLever(title,detail,status,className){
    const card=document.createElement("div");card.className="property-opt-lever-v263";
    const heading=document.createElement("b");heading.textContent=title;
    const text=document.createElement("p");text.textContent=detail;
    const badge=document.createElement("span");badge.className=`property-opt-status-v263 ${className||""}`.trim();badge.textContent=status;
    card.append(heading,text,badge);
    return card;
  }

  function createOptAction(label,prompt){
    const button=document.createElement("button");button.type="button";button.className="property-opt-action-v263";button.textContent=label;button.addEventListener("click",()=>openPropertyAiWithPrompt(prompt));return button;
  }

  function mountPropertyOptimise(){
    const view=document.getElementById("propertyintelligence");
    if(!view)return null;
    let shell=view.querySelector(".property-optimise-v263");
    if(shell)return shell;
    ensureOptimiseStyles();
    shell=document.createElement("section");
    shell.className="property-optimise-v263";
    shell.dataset.propertyPane="optimise";
    shell.dataset.propertyOptimiseRelease=OPTIMISE_RELEASE;
    shell.setAttribute("aria-label","Property optimisation workspace");

    const head=document.createElement("div");head.className="property-opt-head-v263";
    const copy=document.createElement("div");copy.className="property-opt-copy-v263";
    const eyebrow=document.createElement("span");eyebrow.className="property-opt-eyebrow-v263";eyebrow.textContent="OPTIMISE";
    const title=document.createElement("h3");title.className="property-opt-title-v263";title.textContent="Improve the asset without inventing the data";
    const note=document.createElement("p");note.className="property-opt-note-v263";note.textContent="Scenario support uses only current deal inputs. Refinance, capex and hold/sell signals remain incomplete until the required debt, cost and valuation inputs are available.";
    copy.append(eyebrow,title,note);
    const ai=document.createElement("button");ai.type="button";ai.className="property-opt-ai-v263";ai.textContent="Ask Property AI";ai.addEventListener("click",()=>openPropertyAiWithPrompt("Help me optimise this property. Separate scenario assumptions from facts and list the data needed before any refinance, capex or hold/sell decision."));
    head.append(copy,ai);

    const metrics=document.createElement("div");metrics.className="property-opt-metrics-v263";
    metrics.append(
      createOptMetric("Baseline rent","property-opt-base-rent-v263","Current deal input"),
      createOptMetric("Scenario rent","property-opt-target-rent-v263","After selected rent change"),
      createOptMetric("Annual change","property-opt-annual-delta-v263","Scenario versus baseline"),
      createOptMetric("Scenario yield","property-opt-yield-v263","Gross yield at scenario rent")
    );

    const grid=document.createElement("div");grid.className="property-opt-grid-v263";
    const scenario=document.createElement("div");scenario.className="property-opt-scenario-v263";
    const scenarioTitle=document.createElement("b");scenarioTitle.textContent="Rent review scenario";
    const scenarioNote=document.createElement("p");scenarioNote.textContent="Adjust the assumption; this does not represent a market recommendation or live rent estimate.";
    const control=document.createElement("div");control.className="property-opt-control-v263";
    const label=document.createElement("label");label.htmlFor="propertyOptimiseRentUplift";label.textContent="Rent change (%)";
    const input=document.createElement("input");input.id="propertyOptimiseRentUplift";input.type="number";input.min="-50";input.max="100";input.step="0.5";input.value="5";input.inputMode="decimal";input.addEventListener("input",updatePropertyOptimise);
    control.append(label,input);
    const result=document.createElement("div");result.className="property-opt-result-v263";
    const rentResult=document.createElement("div");const rentLabel=document.createElement("span");rentLabel.textContent="Scenario rent";const rentValue=document.createElement("strong");rentValue.className="property-opt-result-rent-v263";rentValue.textContent="—";rentResult.append(rentLabel,rentValue);
    const deltaResult=document.createElement("div");const deltaLabel=document.createElement("span");deltaLabel.textContent="Annual change";const deltaValue=document.createElement("strong");deltaValue.className="property-opt-result-delta-v263";deltaValue.textContent="—";deltaResult.append(deltaLabel,deltaValue);
    result.append(rentResult,deltaResult);
    scenario.append(scenarioTitle,scenarioNote,control,result);

    const levers=document.createElement("div");levers.className="property-opt-levers-v263";
    levers.append(
      createOptLever("Rent review","Model the effect of a user-selected rent change against the current deal input.","Add rent input","property-opt-rent-status-v263"),
      createOptLever("Refinance","Needs current loan balance, rate, term and refinance costs before debt savings can be compared.","Connect debt data",""),
      createOptLever("Capex","Needs a capex budget plus expected rent, occupancy or operating-cost effect before return can be modelled.","Add capex budget",""),
      createOptLever("Hold / sell","Needs current valuation, selling costs, debt settlement and tax inputs before proceeds can be compared.","Add valuation + costs","")
    );
    grid.append(scenario,levers);

    const actions=document.createElement("div");actions.className="property-opt-actions-v263";
    actions.append(
      createOptAction("Stress rent change","Stress-test several rent-change assumptions for this property using only the known deal inputs. Label every assumption clearly."),
      createOptAction("Prepare refinance data","List the exact debt and refinance inputs needed before comparing the existing loan with a refinance scenario."),
      createOptAction("Plan capex analysis","Build a concise capex analysis checklist for this property, including cost, timing, expected benefit and evidence required."),
      createOptAction("Build hold/sell checklist","Build a hold-versus-sell input checklist for this property without choosing an outcome for me.")
    );
    shell.append(head,metrics,grid,actions);

    const valuation=view.querySelector("#propertyValuationServicePanel");
    if(valuation)valuation.insertAdjacentElement("afterend",shell);else view.append(shell);
    updatePropertyOptimise();
    return shell;
  }

  function updatePropertyOptimise(){
    const shell=document.querySelector("#propertyintelligence .property-optimise-v263");
    if(!shell)return;
    const snapshot=propertySnapshot();
    const input=shell.querySelector("#propertyOptimiseRentUplift");
    const raw=Number(input?.value||0);
    const uplift=Number.isFinite(raw)?Math.max(-50,Math.min(100,raw)):0;
    const targetRent=snapshot.rent>0?snapshot.rent*(1+uplift/100):0;
    const annualDelta=snapshot.rent>0?(targetRent-snapshot.rent)*12:NaN;
    const scenarioYield=snapshot.price>0&&targetRent>0?(targetRent*12/snapshot.price)*100:0;
    const set=(selector,value)=>{const node=shell.querySelector(selector);if(node)node.textContent=value};
    set(".property-opt-base-rent-v263",formatPula(snapshot.rent));
    set(".property-opt-target-rent-v263",formatPula(targetRent));
    set(".property-opt-annual-delta-v263",Number.isFinite(annualDelta)?formatSignedPula(annualDelta):"—");
    set(".property-opt-yield-v263",scenarioYield>0?`${scenarioYield.toFixed(1)}%`:"—");
    set(".property-opt-result-rent-v263",formatPula(targetRent));
    set(".property-opt-result-delta-v263",Number.isFinite(annualDelta)?formatSignedPula(annualDelta):"—");
    const status=shell.querySelector(".property-opt-rent-status-v263");
    if(status){
      status.textContent=snapshot.rent>0?"Scenario ready":"Add rent input";
      status.classList.toggle("ready",snapshot.rent>0);
    }
  }

  function ensureCompareStyles(){
    if(document.querySelector('link[data-thebe-property-compare-v264="true"]'))return true;
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href=propertyAssetUrl("/assets/property-compare-v264.css");
    link.dataset.thebePropertyCompareV264="true";
    document.head.append(link);
    return true;
  }

  function readCompareScenario(prefix,fallbackName){
    const name=String(document.getElementById(`${prefix}Name`)?.value||"").trim()||fallbackName;
    const price=parseMoney(document.getElementById(`${prefix}Price`)?.value||"");
    const rent=parseMoney(document.getElementById(`${prefix}Rent`)?.value||"");
    const grossYield=price>0&&rent>0?(rent*12/price)*100:0;
    return {name,price,rent,annualRent:rent*12,grossYield,complete:price>0&&rent>0};
  }

  function currentCompareScenario(){
    const snapshot=propertySnapshot();
    return {name:snapshot.name,price:snapshot.price,rent:snapshot.rent,annualRent:snapshot.rent*12,grossYield:snapshot.grossYield,complete:snapshot.price>0&&snapshot.rent>0};
  }

  function createCompareInput(label,id,placeholder,type="text"){
    const wrap=document.createElement("label");wrap.className="property-compare-field-v264";wrap.htmlFor=id;
    const caption=document.createElement("span");caption.textContent=label;
    const input=document.createElement("input");input.id=id;input.type=type;input.placeholder=placeholder;input.autocomplete="off";
    if(type==="number"){input.min="0";input.step="100";input.inputMode="decimal"}
    input.addEventListener("input",updatePropertyCompare);
    wrap.append(caption,input);
    return wrap;
  }

  function createCompareMetricRow(label,key){
    const row=document.createElement("div");row.className="property-compare-row-v264";row.dataset.compareMetric=key;
    const name=document.createElement("b");name.textContent=label;
    const current=document.createElement("span");current.className=`property-compare-current-${key}-v264`;current.textContent="—";
    const b=document.createElement("span");b.className=`property-compare-b-${key}-v264`;b.textContent="—";
    const c=document.createElement("span");c.className=`property-compare-c-${key}-v264`;c.textContent="—";
    row.append(name,current,b,c);
    return row;
  }

  function createCompareSignal(label,className){
    const card=document.createElement("div");card.className="property-compare-signal-v264";
    const caption=document.createElement("span");caption.textContent=label;
    const value=document.createElement("strong");value.className=className;value.textContent="Need inputs";
    const note=document.createElement("small");note.textContent="Objective signal from entered values only";
    card.append(caption,value,note);
    return card;
  }

  function propertyComparePrompt(){
    const scenarios=[currentCompareScenario(),readCompareScenario("propertyCompareB","Alternative 1"),readCompareScenario("propertyCompareC","Alternative 2")];
    const describe=scenario=>`${scenario.name}: purchase price ${formatPula(scenario.price)}, monthly rent ${formatPula(scenario.rent)}, gross yield ${scenario.grossYield>0?`${scenario.grossYield.toFixed(1)}%`:"unavailable"}`;
    return `Compare these user-entered property scenarios: ${scenarios.map(describe).join("; ")}. Explain the trade-offs visible from price, rent, annual rent and gross yield only. State which inputs are missing for deeper analysis, separate facts from assumptions, and do not choose an investment outcome for me.`;
  }

  function mountPropertyCompare(){
    const view=document.getElementById("propertyintelligence");
    if(!view)return null;
    let shell=view.querySelector(".property-compare-v264");
    if(shell)return shell;
    ensureCompareStyles();
    shell=document.createElement("section");
    shell.className="property-compare-v264";
    shell.dataset.propertyPane="compare";
    shell.dataset.propertyCompareRelease=COMPARE_RELEASE;
    shell.setAttribute("aria-label","Property comparison workspace");

    const head=document.createElement("div");head.className="property-compare-head-v264";
    const copy=document.createElement("div");copy.className="property-compare-copy-v264";
    const eyebrow=document.createElement("span");eyebrow.className="property-compare-eyebrow-v264";eyebrow.textContent="COMPARE";
    const title=document.createElement("h3");title.className="property-compare-title-v264";title.textContent="Compare assets without fabricated comparables";
    const note=document.createElement("p");note.className="property-compare-note-v264";note.textContent="The current deal is compared with up to two alternatives you enter. Thebe calculates only direct input-derived metrics; this is not a live market feed or investment recommendation.";
    copy.append(eyebrow,title,note);
    const ai=document.createElement("button");ai.type="button";ai.className="property-compare-ai-v264";ai.textContent="Ask Property AI";ai.addEventListener("click",()=>openPropertyAiWithPrompt(propertyComparePrompt()));
    head.append(copy,ai);

    const candidates=document.createElement("div");candidates.className="property-compare-candidates-v264";
    const current=document.createElement("div");current.className="property-compare-card-v264 property-compare-current-card-v264";
    const currentLabel=document.createElement("span");currentLabel.className="property-compare-card-label-v264";currentLabel.textContent="CURRENT DEAL";
    const currentName=document.createElement("strong");currentName.className="property-compare-current-name-v264";currentName.textContent="Current property scenario";
    const currentDetail=document.createElement("small");currentDetail.className="property-compare-current-detail-v264";currentDetail.textContent="Add purchase price and rent in Analyse to complete this baseline.";
    current.append(currentLabel,currentName,currentDetail);

    const altB=document.createElement("div");altB.className="property-compare-card-v264 property-compare-input-card-v264";altB.dataset.compareCard="b";
    const altBLabel=document.createElement("span");altBLabel.className="property-compare-card-label-v264";altBLabel.textContent="ALTERNATIVE 1";
    altB.append(altBLabel,createCompareInput("Name","propertyCompareBName","Alternative 1"),createCompareInput("Purchase price","propertyCompareBPrice","0","number"),createCompareInput("Monthly rent","propertyCompareBRent","0","number"));

    const altC=document.createElement("div");altC.className="property-compare-card-v264 property-compare-input-card-v264";altC.dataset.compareCard="c";
    const altCLabel=document.createElement("span");altCLabel.className="property-compare-card-label-v264";altCLabel.textContent="ALTERNATIVE 2";
    altC.append(altCLabel,createCompareInput("Name","propertyCompareCName","Alternative 2"),createCompareInput("Purchase price","propertyCompareCPrice","0","number"),createCompareInput("Monthly rent","propertyCompareCRent","0","number"));
    candidates.append(current,altB,altC);

    const matrix=document.createElement("div");matrix.className="property-compare-matrix-v264";
    const matrixHead=document.createElement("div");matrixHead.className="property-compare-row-v264 property-compare-row-head-v264";
    const metric=document.createElement("b");metric.textContent="Metric";
    const headCurrent=document.createElement("span");headCurrent.textContent="Current";
    const headB=document.createElement("span");headB.textContent="Alt 1";
    const headC=document.createElement("span");headC.textContent="Alt 2";
    matrixHead.append(metric,headCurrent,headB,headC);
    matrix.append(matrixHead,createCompareMetricRow("Purchase price","price"),createCompareMetricRow("Monthly rent","rent"),createCompareMetricRow("Annual rent","annual"),createCompareMetricRow("Gross yield","yield"));

    const signals=document.createElement("div");signals.className="property-compare-signals-v264";
    signals.append(createCompareSignal("Lowest entered price","property-compare-lowest-price-v264"),createCompareSignal("Highest entered rent","property-compare-highest-rent-v264"),createCompareSignal("Highest entered gross yield","property-compare-highest-yield-v264"));

    const actions=document.createElement("div");actions.className="property-compare-actions-v264";
    const compare=document.createElement("button");compare.type="button";compare.className="property-compare-action-v264";compare.textContent="Compare trade-offs";compare.addEventListener("click",()=>openPropertyAiWithPrompt(propertyComparePrompt()));
    const missing=document.createElement("button");missing.type="button";missing.className="property-compare-action-v264";missing.textContent="List deeper-analysis inputs";missing.addEventListener("click",()=>openPropertyAiWithPrompt("For the property scenarios currently entered in Compare, list the additional inputs required for financing, DSCR, operating cash flow, capex, tax and exit analysis. Do not invent values and do not select an investment."));
    actions.append(compare,missing);
    shell.append(head,candidates,matrix,signals,actions);

    const optimise=view.querySelector(".property-optimise-v263");
    if(optimise)optimise.insertAdjacentElement("afterend",shell);else view.append(shell);
    updatePropertyCompare();
    return shell;
  }

  function updatePropertyCompare(){
    const shell=document.querySelector("#propertyintelligence .property-compare-v264");
    if(!shell)return;
    const current=currentCompareScenario();
    const b=readCompareScenario("propertyCompareB","Alternative 1");
    const c=readCompareScenario("propertyCompareC","Alternative 2");
    const scenarios=[current,b,c];
    const set=(selector,value)=>{const node=shell.querySelector(selector);if(node)node.textContent=value};
    set(".property-compare-current-name-v264",current.name);
    set(".property-compare-current-detail-v264",current.complete?`${formatPula(current.price)} · ${formatPula(current.rent)}/month · ${current.grossYield.toFixed(1)}% gross yield`:"Add purchase price and rent in Analyse to complete this baseline.");
    const keys=[
      ["price",scenario=>formatPula(scenario.price)],
      ["rent",scenario=>formatPula(scenario.rent)],
      ["annual",scenario=>formatPula(scenario.annualRent)],
      ["yield",scenario=>scenario.grossYield>0?`${scenario.grossYield.toFixed(1)}%`:"—"]
    ];
    for(const [key,format] of keys){
      set(`.property-compare-current-${key}-v264`,format(current));
      set(`.property-compare-b-${key}-v264`,format(b));
      set(`.property-compare-c-${key}-v264`,format(c));
    }
    const priced=scenarios.filter(scenario=>scenario.price>0);
    const rented=scenarios.filter(scenario=>scenario.rent>0);
    const yielded=scenarios.filter(scenario=>scenario.grossYield>0);
    const lowest=priced.length?priced.reduce((best,scenario)=>scenario.price<best.price?scenario:best):null;
    const highestRent=rented.length?rented.reduce((best,scenario)=>scenario.rent>best.rent?scenario:best):null;
    const highestYield=yielded.length?yielded.reduce((best,scenario)=>scenario.grossYield>best.grossYield?scenario:best):null;
    set(".property-compare-lowest-price-v264",lowest?`${lowest.name} · ${formatPula(lowest.price)}`:"Need inputs");
    set(".property-compare-highest-rent-v264",highestRent?`${highestRent.name} · ${formatPula(highestRent.rent)}`:"Need inputs");
    set(".property-compare-highest-yield-v264",highestYield?`${highestYield.name} · ${highestYield.grossYield.toFixed(1)}%`:"Need inputs");
    const bCard=shell.querySelector('[data-compare-card="b"]');
    const cCard=shell.querySelector('[data-compare-card="c"]');
    bCard?.classList.toggle("ready",b.complete);
    cCard?.classList.toggle("ready",c.complete);
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
    const primaryPane=pane==="optimise"||pane==="compare"?"analyse":pane;
    const calculator=view.querySelector(".property-calculator-v224");
    if(pane!=="analyse")calculator?.style.removeProperty("display");
    view.querySelectorAll(".property-primary-v260 button[data-property-pane-button]").forEach(button=>{
      const active=button.dataset.propertyPaneButton===primaryPane;
      button.classList.toggle("active",active);
      button.setAttribute("aria-selected",active?"true":"false");
      button.tabIndex=active?0:-1;
    });
    if(pane==="analyse")ensurePropertyVisible();
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
    ensureOptimiseStyles();
    ensureCompareStyles();
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
    if(!view.querySelector(".property-analysis-tools-v272")){
      const tools=document.createElement("div");
      tools.className="property-analysis-tools-v272";
      tools.setAttribute("aria-label","Property analysis tools");
      tools.append(createOverviewAction("Deal calculator","analyse"),createOverviewAction("Optimise","optimise"),createOverviewAction("Compare properties","compare"));
      view.querySelector(".property-primary-v260")?.insertAdjacentElement("afterend",tools);
    }
    const portfolio=view.querySelector("#propertyPortfolioWorkspace");
    if(portfolio)portfolio.dataset.propertyPane="properties";
    const valuation=view.querySelector("#propertyValuationServicePanel");
    if(valuation)valuation.dataset.propertyPane="operations";
    mountPropertyOverview();
    mountPropertyOperations();
    mountPropertyOptimise();
    mountPropertyCompare();
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
    updatePropertyOptimise();
    updatePropertyCompare();
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
    optimiseRelease:OPTIMISE_RELEASE,
    compareRelease:COMPARE_RELEASE,
    repair:ensurePropertyVisible,
    mount:mountCompactPropertyChrome,
    setPane:setPropertyPane,
    updateOverview:updatePropertyOverview,
    updateOperations:updatePropertyOperations,
    updateOptimise:updatePropertyOptimise,
    updateCompare:updatePropertyCompare,
    openAi:()=>{propertyAiPending=true;return mountPropertyAiToolbar()},
    openAiWithPrompt:openPropertyAiWithPrompt,
    closeAi:closePropertyAi,
    state:()=>({ready:ensurePropertyVisible(),compact:!!document.getElementById("propertyintelligence")?.classList.contains("property-compact-v260"),pane:document.getElementById("propertyintelligence")?.dataset.propertyActivePane||"today",operationsMounted:!!document.querySelector("#propertyintelligence .property-operations-v262"),optimiseMounted:!!document.querySelector("#propertyintelligence .property-optimise-v263"),compareMounted:!!document.querySelector("#propertyintelligence .property-compare-v264"),aiFullscreen:document.body.classList.contains("property-ai-fullscreen-v260")})
  });
})(window);