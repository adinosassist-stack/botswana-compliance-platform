(function(global){
  "use strict";
  const RELEASE="20261010-property-construction-workflow-v312";
  const STORAGE_KEY="thebe:property-construction:workflow:v312";
  const PROPERTY_ID="propertyintelligence";
  const MAX_LINES=50;

  function n(value){const parsed=Number(String(value??"").replace(/[^0-9.-]/g,""));return Number.isFinite(parsed)?Math.max(0,parsed):0}
  function money(value){if(!Number.isFinite(value))return "—";try{return new Intl.NumberFormat("en-BW",{style:"currency",currency:"BWP",maximumFractionDigits:0}).format(value)}catch(_error){return `P${Math.round(value).toLocaleString()}`}}
  function uid(){return `boq_${global.crypto?.randomUUID?.()||Date.now()+"_"+Math.random().toString(16).slice(2)}`}
  function loadStyles(){if(document.querySelector('link[data-thebe-property-construction-workflow-v312="true"]'))return;const link=document.createElement("link");link.rel="stylesheet";link.href="/assets/property-construction-workflow-v312.css";link.dataset.thebePropertyConstructionWorkflowV312="true";document.head.append(link)}
  function read(){try{return JSON.parse(sessionStorage.getItem(STORAGE_KEY)||"{}")||{}}catch(_error){return {}}}
  function write(value){try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(value||{}))}catch(_error){}}
  function setText(root,selector,value){const node=root.querySelector(selector);if(node)node.textContent=value}
  function field(label,id,{type="text",placeholder="",step="any",min="0"}={}){const wrap=document.createElement("label");wrap.className="construction-workflow-field-v312";const caption=document.createElement("span");caption.textContent=label;const input=document.createElement("input");input.id=id;input.type=type;input.placeholder=placeholder;if(type==="number"){input.min=min;input.step=step;input.inputMode="decimal"}wrap.append(caption,input);return wrap}
  function selectField(label,id,options){const wrap=document.createElement("label");wrap.className="construction-workflow-field-v312";const caption=document.createElement("span");caption.textContent=label;const select=document.createElement("select");select.id=id;for(const [value,text] of options){const option=document.createElement("option");option.value=value;option.textContent=text;select.append(option)}wrap.append(caption,select);return wrap}
  function metric(label,className,helper=""){const box=document.createElement("div");box.className="construction-workflow-metric-v312";const span=document.createElement("span");span.textContent=label;const strong=document.createElement("strong");strong.className=className;strong.textContent="—";box.append(span,strong);if(helper){const small=document.createElement("small");small.textContent=helper;box.append(small)}return box}

  function rateEstimate(){
    const area=n(document.getElementById("constructionAreaV311")?.value);
    const rate=n(document.getElementById("constructionRateV311")?.value);
    if(!area||!rate)return null;
    const prelim=n(document.getElementById("constructionPrelimV311")?.value)/100;
    const fees=n(document.getElementById("constructionFeesV311")?.value)/100;
    const contingency=n(document.getElementById("constructionContingencyV311")?.value)/100;
    const tax=n(document.getElementById("constructionTaxV311")?.value)/100;
    const works=area*rate;
    const pre=works*prelim;
    const prof=works*fees;
    const before=works+pre+prof;
    const cont=before*contingency;
    const taxable=before+cont;
    const vat=taxable*tax;
    return {works,projectTotal:taxable+vat,taxRate:tax};
  }

  function lineFromRow(row){return {id:row.dataset.lineId||uid(),description:String(row.querySelector('[data-line="description"]')?.value||"").trim(),unit:String(row.querySelector('[data-line="unit"]')?.value||"").trim(),qty:n(row.querySelector('[data-line="qty"]')?.value),material:n(row.querySelector('[data-line="material"]')?.value),labour:n(row.querySelector('[data-line="labour"]')?.value)}}
  function rowTotal(line){return line.qty*(line.material+line.labour)}
  function allLines(root){return [...root.querySelectorAll(".construction-boq-row-v312")].map(lineFromRow)}
  function totals(lines){let material=0,labour=0,direct=0;for(const line of lines){material+=line.qty*line.material;labour+=line.qty*line.labour;direct+=rowTotal(line)}return {material,labour,direct}}
  function snapshot(root){
    const lines=allLines(root);
    const itemTotals=totals(lines);
    const markup=n(root.querySelector("#constructionMarkupV312")?.value)/100;
    const contract=n(root.querySelector("#constructionContractValueV312")?.value);
    const rate=rateEstimate();
    const taxRate=rate?.taxRate||0;
    const markupAmount=itemTotals.direct*markup;
    const beforeTax=itemTotals.direct+markupAmount;
    const tax=beforeTax*taxRate;
    const quoteTotal=beforeTax+tax;
    const costBasis=rate?.projectTotal||itemTotals.direct;
    const projectedMargin=contract>0?contract-costBasis:null;
    return {
      client:String(root.querySelector("#constructionClientV312")?.value||"").trim(),
      reference:String(root.querySelector("#constructionReferenceV312")?.value||"").trim(),
      drawingRef:String(root.querySelector("#constructionDrawingRefV312")?.value||"").trim(),
      scope:String(root.querySelector("#constructionScopeV312")?.value||"").trim(),
      approval:String(root.querySelector("#constructionApprovalV312")?.value||"draft"),
      markup,contract,lines,itemTotals,markupAmount,taxRate,tax,quoteTotal,costBasis,projectedMargin,rate
    };
  }

  function save(root){const s=snapshot(root);write({client:s.client,reference:s.reference,drawingRef:s.drawingRef,scope:s.scope,approval:s.approval,markup:s.markup,contract:s.contract,lines:s.lines})}

  function makeRow(root,line={}){
    const row=document.createElement("div");row.className="construction-boq-row-v312";row.dataset.lineId=line.id||uid();
    const make=(key,type="text",placeholder="")=>{const input=document.createElement("input");input.type=type;input.dataset.line=key;input.placeholder=placeholder;if(type==="number"){input.min="0";input.step="any";input.inputMode="decimal"}input.value=line[key]!=null&&line[key]!==0?String(line[key]):"";return input};
    row.append(make("description","text","Item / trade"),make("unit","text","Unit"),make("qty","number","Qty"),make("material","number","Material / unit"),make("labour","number","Labor / unit"));
    const total=document.createElement("strong");total.className="construction-line-total-v312";total.textContent=money(rowTotal(line));
    const remove=document.createElement("button");remove.type="button";remove.className="construction-line-remove-v312";remove.textContent="×";remove.setAttribute("aria-label","Remove BOQ line");remove.addEventListener("click",()=>{row.remove();if(!root.querySelector(".construction-boq-row-v312"))addLine(root);render(root)});
    row.append(total,remove);
    row.addEventListener("input",()=>render(root));
    return row;
  }
  function addLine(root,line={}){const body=root.querySelector(".construction-boq-body-v312");if(!body||body.children.length>=MAX_LINES)return false;body.append(makeRow(root,line));render(root);return true}

  function render(root){
    const s=snapshot(root);
    for(const row of root.querySelectorAll(".construction-boq-row-v312")){const line=lineFromRow(row);setText(row,".construction-line-total-v312",money(rowTotal(line)))}
    setText(root,".construction-boq-material-v312",money(s.itemTotals.material));
    setText(root,".construction-boq-labour-v312",money(s.itemTotals.labour));
    setText(root,".construction-boq-direct-v312",money(s.itemTotals.direct));
    setText(root,".construction-boq-markup-v312",money(s.markupAmount));
    setText(root,".construction-boq-tax-v312",money(s.tax));
    setText(root,".construction-boq-quote-v312",money(s.quoteTotal));
    const variance=s.rate&&s.itemTotals.direct>0?s.itemTotals.direct-s.rate.works:null;
    setText(root,".construction-boq-variance-v312",variance==null?"Add BOQ lines + area-rate estimate":`${variance>=0?"+":""}${money(variance)}`);
    setText(root,".construction-margin-v312",s.projectedMargin==null?"Add contract value":`${s.projectedMargin>=0?"+":""}${money(s.projectedMargin)}`);
    const margin=root.querySelector(".construction-margin-v312");if(margin)margin.dataset.band=s.projectedMargin==null?"neutral":s.projectedMargin>=0?"good":"warn";
    const approval=root.querySelector(".construction-approval-status-v312");if(approval)approval.textContent=s.approval==="approved"?"Approved for handoff":s.approval==="reviewed"?"Reviewed — approval pending":"Draft estimate";
    const handoff=root.querySelector(".construction-project-handoff-v312");if(handoff)handoff.disabled=s.approval!=="approved";
    save(root);
  }

  function summaryPrompt(root,mode){
    const s=snapshot(root);const project=String(document.getElementById("constructionProjectNameV311")?.value||"Unnamed project").trim()||"Unnamed project";
    const lines=s.lines.filter(x=>x.description||x.qty||x.material||x.labour).slice(0,30).map((x,i)=>`${i+1}. ${x.description||"Unnamed item"}; unit ${x.unit||"not set"}; qty ${x.qty}; material/unit ${money(x.material)}; labor/unit ${money(x.labour)}; line total ${money(rowTotal(x))}`).join("\n")||"No itemized BOQ lines entered.";
    const base=`Project: ${project}. Client: ${s.client||"not supplied"}. Reference: ${s.reference||"not supplied"}. Drawing/spec reference: ${s.drawingRef||"not supplied"}. Scope notes: ${s.scope||"not supplied"}. BOQ direct cost ${money(s.itemTotals.direct)}. Markup assumption ${(s.markup*100).toFixed(1)}%. Tax/VAT assumption ${(s.taxRate*100).toFixed(1)}% taken only from the user's Property estimate input. Quote/tender total ${money(s.quoteTotal)}. Contract value ${s.contract?money(s.contract):"not supplied"}. Approval state ${s.approval}. Area-rate project estimate ${s.rate?money(s.rate.projectTotal):"not available"}. Itemized BOQ lines:\n${lines}`;
    if(mode==="takeoff")return `Create a construction takeoff checklist from the supplied scope and drawing/spec reference. Do not infer quantities from drawings you cannot access and do not invent dimensions, rates, material prices or standards. Identify the drawings, measurements and trade quantities that still need to be extracted, grouped into a practical BOQ structure.\n\n${base}`;
    if(mode==="quote")return `Prepare a professional construction quotation/tender draft structure using only the confirmed inputs below. Do not invent contractual terms, rates, quantities, taxes, exclusions, validity periods or payment terms. Clearly mark missing commercial terms for human completion and separate estimate assumptions from confirmed quote data.\n\n${base}`;
    if(mode==="handoff")return `Create a project-start handoff checklist from this approved estimate. Use the estimate as planning data only. Break the handoff into procurement, supplier quotations, work program, cost codes, invoice capture, payment approval, reconciliation, variations and margin tracking. Do not create or claim purchase orders, payments or contracts have been issued.\n\n${base}`;
    return `Review this construction BOQ and estimate. Check arithmetic, scope gaps, unit consistency, double counting, missing trades and pricing assumptions. Do not invent quantities, rates or supplier prices. Distinguish confirmed values from items that require quotations or professional verification.\n\n${base}`;
  }
  function ask(root,mode){const prompt=summaryPrompt(root,mode);if(typeof global.openThebeFromHome==="function")return global.openThebeFromHome(prompt,false);const note=root.querySelector(".construction-workflow-status-v312");if(note)note.textContent="The estimate is ready; Thebe AI handoff is unavailable until the assistant runtime is active."}
  function openView(id){if(typeof global.showView==="function")return global.showView(id);return false}

  function enterMode(view,button){
    try{global.ThebePropertyVisibility?.setPane?.("today",{focus:false})}catch(_error){}
    view.dataset.propertyConstructionMode="estimating";
    view.querySelectorAll(".property-primary-v260 button").forEach(node=>{node.classList.remove("active");node.setAttribute("aria-selected","false");node.tabIndex=-1});
    button.classList.add("active");button.setAttribute("aria-selected","true");button.tabIndex=0;
    view.querySelector(".property-construction-v311")?.scrollIntoView({block:"start",behavior:"smooth"});
  }
  function exitMode(view){if(view.dataset.propertyConstructionMode==="estimating")delete view.dataset.propertyConstructionMode}

  function mountNav(view){
    const nav=view.querySelector(".property-primary-v260");if(!nav)return false;
    if(nav.querySelector('[data-property-construction-tab="estimating"]'))return true;
    const button=document.createElement("button");button.type="button";button.textContent="Estimating";button.dataset.propertyConstructionTab="estimating";button.setAttribute("role","tab");button.setAttribute("aria-selected","false");button.tabIndex=-1;button.addEventListener("click",()=>enterMode(view,button));
    button.addEventListener("keydown",event=>{if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight")return;event.preventDefault();const buttons=[...nav.querySelectorAll("button")];const index=buttons.indexOf(button);const delta=event.key==="ArrowRight"?1:-1;buttons[(index+delta+buttons.length)%buttons.length]?.focus()});
    nav.append(button);
    nav.addEventListener("click",event=>{const target=event.target.closest?.("button[data-property-pane-button]");if(target)exitMode(view)});
    return true;
  }

  function mountWorkflow(section){
    if(section.querySelector(".construction-workflow-v312"))return true;
    const root=document.createElement("section");root.className="construction-workflow-v312";root.dataset.release=RELEASE;root.setAttribute("aria-label","Itemized construction estimating workflow");
    const head=document.createElement("div");head.className="construction-workflow-head-v312";const copy=document.createElement("div");const eyebrow=document.createElement("span");eyebrow.textContent="ESTIMATING WORKFLOW";const title=document.createElement("h4");title.textContent="Scope → BOQ → pricing → quote → project handoff";const intro=document.createElement("p");intro.textContent="Build an itemized estimate from confirmed quantities and rates, then move an approved estimate into Work and Money for execution tracking.";copy.append(eyebrow,title,intro);const status=document.createElement("span");status.className="construction-approval-status-v312";status.textContent="Draft estimate";head.append(copy,status);

    const stages=document.createElement("div");stages.className="construction-stage-strip-v312";["Scope / takeoff","BOQ","Pricing","Quote / tender","Project handoff"].forEach((text,index)=>{const item=document.createElement("span");item.textContent=`${index+1}. ${text}`;stages.append(item)});

    const scope=document.createElement("div");scope.className="construction-workflow-card-v312";const scopeTitle=document.createElement("h5");scopeTitle.textContent="Scope and takeoff intake";const scopeFields=document.createElement("div");scopeFields.className="construction-workflow-fields-v312";scopeFields.append(field("Client","constructionClientV312",{placeholder:"Optional"}),field("Estimate / tender reference","constructionReferenceV312",{placeholder:"Optional"}),field("Drawing / specification reference","constructionDrawingRefV312",{placeholder:"e.g. Rev C / architect set"}));const scopeLabel=document.createElement("label");scopeLabel.className="construction-workflow-field-v312 wide";const scopeCaption=document.createElement("span");scopeCaption.textContent="Scope notes";const scopeText=document.createElement("textarea");scopeText.id="constructionScopeV312";scopeText.rows=3;scopeText.placeholder="Describe the works, exclusions and known drawing scope. Quantities are not inferred automatically.";scopeLabel.append(scopeCaption,scopeText);const takeoff=document.createElement("button");takeoff.type="button";takeoff.className="construction-workflow-action-v312 secondary";takeoff.textContent="Prepare takeoff checklist with Thebe";takeoff.addEventListener("click",()=>ask(root,"takeoff"));scope.append(scopeTitle,scopeFields,scopeLabel,takeoff);

    const boq=document.createElement("div");boq.className="construction-workflow-card-v312";const boqHead=document.createElement("div");boqHead.className="construction-card-head-v312";const boqTitle=document.createElement("h5");boqTitle.textContent="Itemized BOQ";const add=document.createElement("button");add.type="button";add.className="construction-workflow-action-v312 secondary";add.textContent="+ Add line";add.addEventListener("click",()=>addLine(root));boqHead.append(boqTitle,add);const headers=document.createElement("div");headers.className="construction-boq-headers-v312";["Item / trade","Unit","Qty","Material / unit","Labor / unit","Line total",""] .forEach(text=>{const span=document.createElement("span");span.textContent=text;headers.append(span)});const body=document.createElement("div");body.className="construction-boq-body-v312";boq.append(boqHead,headers,body);

    const pricing=document.createElement("div");pricing.className="construction-workflow-card-v312";const pricingTitle=document.createElement("h5");pricingTitle.textContent="Pricing and margin";const pricingFields=document.createElement("div");pricingFields.className="construction-workflow-fields-v312";pricingFields.append(field("Markup (%)","constructionMarkupV312",{type:"number",placeholder:"0",step:"0.1"}),field("Contract / selling value (P)","constructionContractValueV312",{type:"number",placeholder:"Optional"}),selectField("Estimate status","constructionApprovalV312",[["draft","Draft"],["reviewed","Reviewed"],["approved","Approved for handoff"]]));const metrics=document.createElement("div");metrics.className="construction-workflow-metrics-v312";metrics.append(metric("Materials","construction-boq-material-v312"),metric("Labor","construction-boq-labour-v312"),metric("Direct BOQ cost","construction-boq-direct-v312"),metric("Markup","construction-boq-markup-v312"),metric("Tax / VAT","construction-boq-tax-v312","Uses the explicit tax rate entered in the Property estimate"),metric("Quote / tender total","construction-boq-quote-v312"),metric("BOQ vs area-rate works","construction-boq-variance-v312","Difference between itemized direct cost and the area-rate base works"),metric("Projected gross margin","construction-margin-v312","Contract value minus the current project cost basis"));pricing.append(pricingTitle,pricingFields,metrics);

    const actions=document.createElement("div");actions.className="construction-workflow-actions-v312";const review=document.createElement("button");review.type="button";review.className="construction-workflow-action-v312";review.textContent="Review BOQ with Thebe";review.addEventListener("click",()=>ask(root,"review"));const quote=document.createElement("button");quote.type="button";quote.className="construction-workflow-action-v312 secondary";quote.textContent="Prepare quote / tender";quote.addEventListener("click",()=>ask(root,"quote"));const handoff=document.createElement("button");handoff.type="button";handoff.className="construction-workflow-action-v312 construction-project-handoff-v312";handoff.textContent="Build project handoff";handoff.disabled=true;handoff.addEventListener("click",()=>ask(root,"handoff"));const work=document.createElement("button");work.type="button";work.className="construction-workflow-action-v312 ghost";work.textContent="Open Work";work.addEventListener("click",()=>openView("workhub"));const finance=document.createElement("button");finance.type="button";finance.className="construction-workflow-action-v312 ghost";finance.textContent="Open Money";finance.addEventListener("click",()=>openView("moneyhub"));actions.append(review,quote,handoff,work,finance);
    const note=document.createElement("p");note.className="construction-workflow-status-v312";note.textContent="BOQ lines, markup and approval status are planning inputs in this browser session. Supplier quotes, purchase orders, invoices, payments and contracts are not created by this panel.";
    root.append(head,stages,scope,boq,pricing,actions,note);section.append(root);

    const saved=read();root.querySelector("#constructionClientV312").value=saved.client||"";root.querySelector("#constructionReferenceV312").value=saved.reference||"";root.querySelector("#constructionDrawingRefV312").value=saved.drawingRef||"";root.querySelector("#constructionScopeV312").value=saved.scope||"";root.querySelector("#constructionMarkupV312").value=saved.markup?String(saved.markup*100):"";root.querySelector("#constructionContractValueV312").value=saved.contract||"";root.querySelector("#constructionApprovalV312").value=saved.approval||"draft";
    const restored=Array.isArray(saved.lines)&&saved.lines.length?saved.lines:[{description:"",unit:"",qty:0,material:0,labour:0}];restored.slice(0,MAX_LINES).forEach(line=>addLine(root,line));
    root.addEventListener("input",()=>render(root));root.addEventListener("change",()=>render(root));render(root);return true;
  }

  function mount(){
    loadStyles();const view=document.getElementById(PROPERTY_ID);const section=view?.querySelector(".property-construction-v311");if(!view||!section)return false;mountNav(view);mountWorkflow(section);return true;
  }
  function install(){if(mount())return;if(typeof MutationObserver!=="function")return;const root=document.getElementById("mainContent")||document.body||document.documentElement;if(!root)return;const observer=new MutationObserver(()=>{if(mount())observer.disconnect()});observer.observe(root,{childList:true,subtree:true})}
  if(typeof global.whenThebeWorkspaceReady==="function")global.whenThebeWorkspaceReady(install);else if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
  global.ThebePropertyConstructionWorkflow=Object.freeze({release:RELEASE,mount});
})(window);
