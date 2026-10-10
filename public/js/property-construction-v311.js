(function(global){
  "use strict";
  const RELEASE="20261010-property-construction-v311";
  const STORAGE_KEY="thebe:property-construction:v311";
  const PROPERTY_ID="propertyintelligence";
  const MARKET_ID="industryintel";

  function numberValue(value){
    const parsed=Number(String(value??"").replace(/[^0-9.-]/g,""));
    return Number.isFinite(parsed)?Math.max(0,parsed):0;
  }

  function money(value){
    if(!Number.isFinite(value))return "—";
    try{return new Intl.NumberFormat("en-BW",{style:"currency",currency:"BWP",maximumFractionDigits:0}).format(value)}
    catch(_error){return `P${Math.round(value).toLocaleString()}`}
  }

  function signedMoney(value){
    if(!Number.isFinite(value))return "—";
    const prefix=value>0?"+":"";
    return `${prefix}${money(value)}`;
  }

  function loadStyles(){
    if(document.querySelector('link[data-thebe-property-construction-v311="true"]'))return;
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="/assets/property-construction-v311.css";
    link.dataset.thebePropertyConstructionV311="true";
    document.head.append(link);
  }

  function readState(){
    try{return JSON.parse(sessionStorage.getItem(STORAGE_KEY)||"{}")||{}}
    catch(_error){return {}}
  }

  function writeState(state){
    try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(state||{}))}catch(_error){}
  }

  function makeField({id,label,type="number",placeholder="",step="any",min="0",helper=""}){
    const wrap=document.createElement("label");
    wrap.className="construction-field-v311";
    const caption=document.createElement("span");
    caption.className="construction-field-label-v311";
    caption.textContent=label;
    const input=document.createElement("input");
    input.id=id;
    input.type=type;
    input.placeholder=placeholder;
    if(type==="number"){
      input.step=step;
      input.min=min;
      input.inputMode="decimal";
    }
    wrap.append(caption,input);
    if(helper){
      const note=document.createElement("small");
      note.textContent=helper;
      wrap.append(note);
    }
    return wrap;
  }

  function makeSelect(id,label,options){
    const wrap=document.createElement("label");
    wrap.className="construction-field-v311";
    const caption=document.createElement("span");
    caption.className="construction-field-label-v311";
    caption.textContent=label;
    const select=document.createElement("select");
    select.id=id;
    for(const [value,text] of options){
      const option=document.createElement("option");
      option.value=value;
      option.textContent=text;
      select.append(option);
    }
    wrap.append(caption,select);
    return wrap;
  }

  function metric(label,className,helper=""){
    const item=document.createElement("div");
    item.className="construction-metric-v311";
    const caption=document.createElement("span");caption.textContent=label;
    const value=document.createElement("strong");value.className=className;value.textContent="—";
    item.append(caption,value);
    if(helper){const note=document.createElement("small");note.textContent=helper;item.append(note)}
    return item;
  }

  function values(){
    const get=id=>document.getElementById(id);
    return {
      name:String(get("constructionProjectNameV311")?.value||"").trim(),
      type:String(get("constructionProjectTypeV311")?.value||"residential"),
      area:numberValue(get("constructionAreaV311")?.value),
      rate:numberValue(get("constructionRateV311")?.value),
      prelim:numberValue(get("constructionPrelimV311")?.value)/100,
      fees:numberValue(get("constructionFeesV311")?.value)/100,
      contingency:numberValue(get("constructionContingencyV311")?.value)/100,
      tax:numberValue(get("constructionTaxV311")?.value)/100,
      land:numberValue(get("constructionLandV311")?.value),
      budget:numberValue(get("constructionBudgetV311")?.value)
    };
  }

  function estimate(input){
    if(!input.area||!input.rate)return null;
    const calc=rate=>{
      const works=input.area*rate;
      const prelim=works*input.prelim;
      const fees=works*input.fees;
      const beforeContingency=works+prelim+fees;
      const contingency=beforeContingency*input.contingency;
      const taxable=beforeContingency+contingency;
      const tax=taxable*input.tax;
      const projectTotal=taxable+tax;
      const allIn=projectTotal+input.land;
      return {works,prelim,fees,contingency,tax,projectTotal,allIn};
    };
    const base=calc(input.rate);
    const stress=calc(input.rate*1.10);
    return {
      ...base,
      stressAllIn:stress.allIn,
      costPerSqm:input.area>0?base.projectTotal/input.area:0,
      headroom:input.budget>0?input.budget-base.allIn:null
    };
  }

  function setText(root,selector,text){
    const node=root.querySelector(selector);
    if(node)node.textContent=text;
  }

  function renderEstimate(section){
    const input=values();
    const result=estimate(input);
    const readiness=(input.area?50:0)+(input.rate?50:0);
    const ready=section.querySelector(".construction-readiness-value-v311");
    const ring=section.querySelector(".construction-readiness-ring-v311");
    if(ready)ready.textContent=`${readiness}%`;
    if(ring){
      ring.style.setProperty("--construction-angle",`${readiness*3.6}deg`);
      ring.setAttribute("aria-label",`Estimate readiness ${readiness} percent`);
    }
    const status=section.querySelector(".construction-status-v311");
    if(status)status.textContent=result?"Estimate ready":"Add area and a confirmed rate per m²";

    if(!result){
      for(const selector of [".construction-works-v311",".construction-prelim-v311",".construction-fees-v311",".construction-contingency-v311",".construction-tax-v311",".construction-total-v311",".construction-allin-v311",".construction-psm-v311",".construction-stress-v311",".construction-headroom-v311"]){
        setText(section,selector,"—");
      }
    }else{
      setText(section,".construction-works-v311",money(result.works));
      setText(section,".construction-prelim-v311",money(result.prelim));
      setText(section,".construction-fees-v311",money(result.fees));
      setText(section,".construction-contingency-v311",money(result.contingency));
      setText(section,".construction-tax-v311",money(result.tax));
      setText(section,".construction-total-v311",money(result.projectTotal));
      setText(section,".construction-allin-v311",money(result.allIn));
      setText(section,".construction-psm-v311",money(result.costPerSqm));
      setText(section,".construction-stress-v311",money(result.stressAllIn));
      setText(section,".construction-headroom-v311",result.headroom==null?"Add budget":signedMoney(result.headroom));
      const headroomNode=section.querySelector(".construction-headroom-v311");
      if(headroomNode){
        headroomNode.dataset.band=result.headroom==null?"neutral":result.headroom>=0?"good":"warn";
      }
    }
    writeState(input);
  }

  function restore(section){
    const state=readState();
    const map={
      constructionProjectNameV311:state.name,
      constructionProjectTypeV311:state.type,
      constructionAreaV311:state.area,
      constructionRateV311:state.rate,
      constructionPrelimV311:state.prelim!=null?state.prelim*100:null,
      constructionFeesV311:state.fees!=null?state.fees*100:null,
      constructionContingencyV311:state.contingency!=null?state.contingency*100:null,
      constructionTaxV311:state.tax!=null?state.tax*100:null,
      constructionLandV311:state.land,
      constructionBudgetV311:state.budget
    };
    for(const [id,value] of Object.entries(map)){
      const input=section.querySelector(`#${id}`);
      if(input&&value!=null&&value!=="")input.value=String(value);
    }
    renderEstimate(section);
  }

  function askThebe(section){
    const input=values();
    const result=estimate(input);
    if(!result){
      const status=section.querySelector(".construction-status-v311");
      if(status)status.textContent="Add floor area and a confirmed construction rate first.";
      section.querySelector("#constructionAreaV311")?.focus();
      return;
    }
    const prompt=`Refine this construction estimate using only the assumptions supplied here. Do not invent market rates, supplier prices, taxes, professional fees or quantities. Project ${input.name||"unnamed"}; type ${input.type}; floor area ${input.area} m²; confirmed construction rate ${money(input.rate)} per m²; preliminaries ${(input.prelim*100).toFixed(1)}%; professional fees ${(input.fees*100).toFixed(1)}%; contingency ${(input.contingency*100).toFixed(1)}%; tax/VAT assumption ${(input.tax*100).toFixed(1)}%; land or existing property cost ${money(input.land)}; budget ceiling ${input.budget?money(input.budget):"not supplied"}. Calculated project cost ${money(result.projectTotal)} and all-in development cost ${money(result.allIn)}. A 10% construction-rate stress produces ${money(result.stressAllIn)} all-in. Explain the cost drivers, identify missing assumptions, suggest a practical bill-of-quantities structure, and separate confirmed inputs from items that still need quotations or professional verification.`;
    if(typeof global.openThebeFromHome==="function"){
      global.openThebeFromHome(prompt,false);
      return;
    }
    const status=section.querySelector(".construction-status-v311");
    if(status)status.textContent="Estimate calculated. Thebe AI handoff will be available when the assistant runtime is active.";
  }

  function pullPropertyPrice(section){
    const source=document.getElementById("propertyPurchasePrice");
    const target=section.querySelector("#constructionLandV311");
    if(!source||!target)return;
    const amount=numberValue(source.value);
    if(!amount){
      const status=section.querySelector(".construction-status-v311");
      if(status)status.textContent="No purchase price is entered in the property deal calculator yet.";
      return;
    }
    target.value=String(amount);
    renderEstimate(section);
  }

  function reset(section){
    try{sessionStorage.removeItem(STORAGE_KEY)}catch(_error){}
    section.querySelectorAll("input").forEach(input=>input.value="");
    const type=section.querySelector("#constructionProjectTypeV311");
    if(type)type.value="residential";
    renderEstimate(section);
  }

  function mountProperty(){
    const view=document.getElementById(PROPERTY_ID);
    if(!view)return false;
    if(view.querySelector(".property-construction-v311"))return true;
    loadStyles();

    const section=document.createElement("section");
    section.className="property-construction-v311";
    section.dataset.propertyConstructionRelease=RELEASE;
    section.setAttribute("aria-label","Construction and development estimator");

    const head=document.createElement("div");
    head.className="construction-head-v311";
    const copy=document.createElement("div");
    const eyebrow=document.createElement("span");eyebrow.className="construction-eyebrow-v311";eyebrow.textContent="PROPERTY · CONSTRUCTION";
    const title=document.createElement("h3");title.textContent="Estimate a build before you commit";
    const intro=document.createElement("p");intro.textContent="Turn confirmed area and cost assumptions into a development budget, stress case and Thebe review. No market rate is invented for you.";
    copy.append(eyebrow,title,intro);
    const badge=document.createElement("span");badge.className="construction-badge-v311";badge.textContent="Assumption-based";
    head.append(copy,badge);

    const layout=document.createElement("div");layout.className="construction-layout-v311";
    const form=document.createElement("div");form.className="construction-form-v311";
    const fields=document.createElement("div");fields.className="construction-fields-v311";
    fields.append(
      makeField({id:"constructionProjectNameV311",label:"Project name",type:"text",placeholder:"e.g. Matsiloje house"}),
      makeSelect("constructionProjectTypeV311","Project type",[["residential","Residential build"],["extension","Extension"],["renovation","Renovation"],["commercial","Commercial / fit-out"]]),
      makeField({id:"constructionAreaV311",label:"Floor area (m²)",placeholder:"e.g. 310",step:"0.1"}),
      makeField({id:"constructionRateV311",label:"Confirmed construction rate (P/m²)",placeholder:"Enter your rate",helper:"Use a quote, QS rate or your own verified benchmark."}),
      makeField({id:"constructionPrelimV311",label:"Preliminaries (%)",placeholder:"0",step:"0.1"}),
      makeField({id:"constructionFeesV311",label:"Professional fees (%)",placeholder:"0",step:"0.1"}),
      makeField({id:"constructionContingencyV311",label:"Contingency (%)",placeholder:"0",step:"0.1"}),
      makeField({id:"constructionTaxV311",label:"VAT / tax assumption (%)",placeholder:"0",step:"0.1",helper:"Enter only a rate you have confirmed applies."}),
      makeField({id:"constructionLandV311",label:"Land / existing property cost (P)",placeholder:"Optional"}),
      makeField({id:"constructionBudgetV311",label:"Budget ceiling (P)",placeholder:"Optional"})
    );
    const actions=document.createElement("div");actions.className="construction-actions-v311";
    const pull=document.createElement("button");pull.type="button";pull.className="construction-button-v311 alt";pull.textContent="Use property purchase price";pull.addEventListener("click",()=>pullPropertyPrice(section));
    const clear=document.createElement("button");clear.type="button";clear.className="construction-button-v311 ghost";clear.textContent="Reset";clear.addEventListener("click",()=>reset(section));
    actions.append(pull,clear);
    form.append(fields,actions);

    const results=document.createElement("div");results.className="construction-results-v311";
    const resultHead=document.createElement("div");resultHead.className="construction-result-head-v311";
    const ring=document.createElement("div");ring.className="construction-readiness-ring-v311";ring.setAttribute("role","img");
    const ringValue=document.createElement("strong");ringValue.className="construction-readiness-value-v311";ringValue.textContent="0%";ring.append(ringValue);
    const resultCopy=document.createElement("div");
    const resultTitle=document.createElement("b");resultTitle.textContent="Estimate readiness";
    const status=document.createElement("span");status.className="construction-status-v311";status.textContent="Add area and a confirmed rate per m²";
    resultCopy.append(resultTitle,status);
    resultHead.append(ring,resultCopy);

    const primary=document.createElement("div");primary.className="construction-primary-v311";
    primary.append(metric("Project cost","construction-total-v311","Before land / existing property cost"),metric("All-in development cost","construction-allin-v311","Project cost plus land / existing property cost"),metric("Cost per m²","construction-psm-v311","Project cost ÷ floor area"),metric("+10% rate stress","construction-stress-v311","All-in cost if the construction rate rises 10%"));

    const breakdown=document.createElement("details");breakdown.className="construction-breakdown-v311";
    const summary=document.createElement("summary");summary.textContent="Cost breakdown";
    const grid=document.createElement("div");grid.className="construction-breakdown-grid-v311";
    grid.append(metric("Base works","construction-works-v311"),metric("Preliminaries","construction-prelim-v311"),metric("Professional fees","construction-fees-v311"),metric("Contingency","construction-contingency-v311"),metric("VAT / tax assumption","construction-tax-v311"),metric("Budget headroom","construction-headroom-v311"));
    breakdown.append(summary,grid);

    const ai=document.createElement("button");ai.type="button";ai.className="construction-ai-v311";ai.textContent="Refine estimate with Thebe";ai.addEventListener("click",()=>askThebe(section));
    const caution=document.createElement("p");caution.className="construction-caution-v311";caution.textContent="Planning estimate only. Quantities, rates, taxes, fees and professional scopes remain subject to confirmed quotations and professional review.";
    results.append(resultHead,primary,breakdown,ai,caution);
    layout.append(form,results);
    section.append(head,layout);

    const valuation=view.querySelector("#propertyValuationServicePanel");
    const portfolio=view.querySelector("#propertyPortfolioWorkspace");
    if(valuation)valuation.insertAdjacentElement("beforebegin",section);
    else if(portfolio)portfolio.insertAdjacentElement("afterend",section);
    else view.append(section);

    section.addEventListener("input",()=>renderEstimate(section));
    section.addEventListener("change",()=>renderEstimate(section));
    restore(section);
    return true;
  }

  function regionalPrompt(){
    const prompt="Help me assess Thebe Desk regional expansion from Botswana into Namibia and then other African markets. Use only verified or connected market, regulatory, property, construction, labour and procurement information. Separate live coverage from planned coverage, identify the highest-value datasets to add next, and do not present unsourced market estimates as facts.";
    if(typeof global.openThebeFromHome==="function")global.openThebeFromHome(prompt,false);
  }

  function mountMarket(){
    const view=document.getElementById(MARKET_ID);
    if(!view)return false;
    if(view.querySelector(".africa-market-foundation-v311"))return true;
    loadStyles();
    const section=document.createElement("section");
    section.className="africa-market-foundation-v311";
    section.dataset.africaMarketRelease=RELEASE;
    const head=document.createElement("div");head.className="africa-market-head-v311";
    const copy=document.createElement("div");
    const eyebrow=document.createElement("span");eyebrow.className="construction-eyebrow-v311";eyebrow.textContent="MARKET · AFRICA EXPANSION";
    const title=document.createElement("h3");title.textContent="Grow the intelligence layer without another top-level module";
    const intro=document.createElement("p");intro.textContent="Botswana remains the live proof market, Namibia is next, and broader African coverage can expand country by country as governed sources are connected.";
    copy.append(eyebrow,title,intro);
    const ask=document.createElement("button");ask.type="button";ask.className="construction-button-v311";ask.textContent="Plan regional coverage with Thebe";ask.addEventListener("click",regionalPrompt);
    head.append(copy,ask);
    const cards=document.createElement("div");cards.className="africa-market-cards-v311";
    const data=[
      ["Botswana","Live foundation","Compliance, business and property context remain the operating baseline."],
      ["Namibia","Next rollout","Reuse the same source-governed model before activating country-specific intelligence."],
      ["Africa","Expand by evidence","Add regulatory, property, construction, labour and procurement sources country by country."]
    ];
    for(const [name,status,detail] of data){
      const card=document.createElement("div");card.className="africa-market-card-v311";
      const label=document.createElement("span");label.textContent=status;
      const heading=document.createElement("b");heading.textContent=name;
      const text=document.createElement("p");text.textContent=detail;
      card.append(label,heading,text);
      cards.append(card);
    }
    const note=document.createElement("p");note.className="construction-caution-v311";note.textContent="This is the product coverage foundation, not a claim that full Africa-wide live intelligence is already available.";
    section.append(head,cards,note);
    view.prepend(section);
    return true;
  }

  function mountAll(){
    const property=mountProperty();
    const market=mountMarket();
    return property&&market;
  }

  function install(){
    loadStyles();
    mountAll();
    if(typeof MutationObserver!=="function")return;
    const root=document.getElementById("mainContent")||document.body||document.documentElement;
    if(!root)return;
    const observer=new MutationObserver(()=>mountAll());
    observer.observe(root,{childList:true,subtree:true});
  }

  if(typeof global.whenThebeWorkspaceReady==="function")global.whenThebeWorkspaceReady(install);
  else if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})(window);
