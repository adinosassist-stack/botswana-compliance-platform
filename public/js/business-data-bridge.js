(function initBusinessDataBridge(global){
  "use strict";

  const RELEASE="20260913d";
  const MAX_FILE_BYTES=1024*1024;
  const MAX_ROWS=500;
  const MAX_IMPORT_HISTORY=20;
  const MAX_CAMPAIGNS=50;
  const MAX_OPPORTUNITIES=500;
  const PROFILE_KEYS=Object.freeze({
    monthlyRevenueTargetBwp:"decisionMonthlyRevenueTargetBwp",
    currentCashBwp:"decisionCurrentCashBwp",
    minimumCashBufferBwp:"decisionMinimumCashBufferBwp",
    monthlyCashOutflowsBwp:"decisionMonthlyCashOutflowsBwp",
    monthlyLabourCostBwp:"decisionMonthlyLabourCostBwp",
    plannedPurchaseBwp:"decisionPlannedPurchaseBwp",
    operatingDaysPerMonth:"decisionOperatingDaysPerMonth",
    plannedPurchaseLabel:"decisionPlannedPurchaseLabel",
    sameMonthCollectionPct:"decisionSameMonthCollectionPct"
  });

  let activePreview=null;
  let scheduled=false;
  let ensurePanelPromise=null;

  const q=(selector,root=document)=>root.querySelector(selector);
  const text=(tag,value,className="")=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    node.textContent=String(value??"");
    return node;
  };
  const button=(label,handler,className="btn soft")=>{
    const node=document.createElement("button");
    node.type="button";
    node.className=className;
    node.textContent=label;
    node.addEventListener("click",handler);
    return node;
  };
  const role=()=>{
    try{return String(global.currentWorkspaceRole?.()||global.currentUser?.role||"").toLowerCase()}
    catch{return ""}
  };
  const canImportSales=()=>["owner","manager"].includes(role());
  const canImportFinance=()=>role()==="owner";
  const request=(url,options={})=>{
    if(typeof global.apiJson!=="function")throw new Error("The secure Thebe API transport is not available.");
    return global.apiJson(url,options);
  };
  const clean=value=>String(value??"").trim();
  const compact=value=>clean(value).replace(/\s+/g," ");
  const key=value=>compact(value).toLowerCase();
  const number=value=>{
    const raw=clean(value).replace(/,/g,"").replace(/^P\s*/i,"");
    if(raw==="")return null;
    const n=Number(raw);
    return Number.isFinite(n)?n:null;
  };
  const bool=value=>{
    const raw=key(value);
    if(["1","true","yes","y","active"].includes(raw))return true;
    if(["0","false","no","n","inactive"].includes(raw))return false;
    return null;
  };
  const isoDate=value=>{
    const raw=clean(value);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return false;
    const parsed=new Date(`${raw}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===raw;
  };
  const nowIso=()=>new Date().toISOString();
  const uid=prefix=>`${prefix}_${global.crypto?.randomUUID?.()||`${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
  const clone=value=>typeof global.structuredClone==="function"?global.structuredClone(value):JSON.parse(JSON.stringify(value));

  function activeCompany(state){
    const companies=Array.isArray(state?.companies)?state.companies:[];
    const activeId=String(state?.activeCompanyId||"");
    return companies.find(company=>String(company?.id||"")===activeId)||companies[0]||null;
  }

  function ensureSales(company){
    if(!company.salesIntelligence||typeof company.salesIntelligence!=="object"){
      company.salesIntelligence={version:1,settings:{dormantDays:10,dormantRecoveryPct:null},opportunities:[],campaigns:[]};
    }
    if(!Array.isArray(company.salesIntelligence.opportunities))company.salesIntelligence.opportunities=[];
    if(!Array.isArray(company.salesIntelligence.campaigns))company.salesIntelligence.campaigns=[];
    if(!company.salesIntelligence.settings||typeof company.salesIntelligence.settings!=="object"){
      company.salesIntelligence.settings={dormantDays:10,dormantRecoveryPct:null};
    }
    return company.salesIntelligence;
  }

  function ensureImportHistory(company){
    if(!Array.isArray(company.dataImports))company.dataImports=[];
    return company.dataImports;
  }

  function normalizeHeader(value){
    return clean(value).replace(/^\uFEFF/,"").toLowerCase().replace(/[^a-z0-9]/g,"");
  }

  function parseCsv(source){
    const input=String(source||"");
    const rows=[];
    let row=[],field="",quoted=false;
    for(let i=0;i<input.length;i++){
      const ch=input[i];
      if(quoted){
        if(ch==='"'){
          if(input[i+1]==='"'){field+='"';i++;}
          else quoted=false;
        }else field+=ch;
        continue;
      }
      if(ch==='"'){quoted=true;continue;}
      if(ch===","){row.push(field);field="";continue;}
      if(ch==="\n"){
        row.push(field);field="";
        if(row.some(cell=>clean(cell)!==""))rows.push(row);
        row=[];
        if(rows.length>MAX_ROWS+1)throw new Error(`CSV contains more than ${MAX_ROWS} data rows.`);
        continue;
      }
      if(ch!=="\r")field+=ch;
    }
    if(quoted)throw new Error("CSV contains an unclosed quoted field.");
    row.push(field);
    if(row.some(cell=>clean(cell)!==""))rows.push(row);
    if(!rows.length)throw new Error("CSV is empty.");
    if(rows.length-1>MAX_ROWS)throw new Error(`CSV contains more than ${MAX_ROWS} data rows.`);

    const headers=rows[0].map(normalizeHeader);
    if(headers.some(header=>!header))throw new Error("CSV contains a blank column heading.");
    if(new Set(headers).size!==headers.length)throw new Error("CSV contains duplicate column headings.");
    return rows.slice(1).map((cells,index)=>{
      if(cells.length>headers.length&&cells.slice(headers.length).some(cell=>clean(cell)!=="")){
        throw new Error(`Row ${index+2} contains more values than the header row.`);
      }
      const record={__row:index+2};
      headers.forEach((header,column)=>{record[header]=cells[column]??""});
      return record;
    });
  }

  function requireHeaders(rows,required){
    const sample=rows[0]||{};
    const missing=required.filter(name=>!(name in sample));
    if(missing.length)throw new Error(`Missing required column${missing.length===1?"":"s"}: ${missing.join(", ")}.`);
  }

  function quotationKey(row){
    return `${key(row.reference)}|${key(row.location)}|${clean(row.quotedAt||row.quotedat)}`;
  }

  function planQuotations(rows,state){
    requireHeaders(rows,["reference","location","quotevaluebwp","quotedat"]);
    const company=activeCompany(state);
    if(!company)throw new Error("Active company not found.");
    const sales=ensureSales(company);
    const campaignByName=new Map(sales.campaigns.map(item=>[key(item.name),String(item.id)]));
    const existing=new Map(sales.opportunities.map(item=>[quotationKey(item),item]));
    const normalized=[];
    const seen=new Set();
    const errors=[];
    const warnings=[];
    let creates=0,updates=0;

    for(const row of rows){
      const reference=compact(row.reference).slice(0,120);
      const location=compact(row.location).slice(0,80);
      const quoteValue=number(row.quotevaluebwp);
      const quotedAt=clean(row.quotedat);
      const lastContactAt=clean(row.lastcontactat)||quotedAt;
      const status=key(row.status)||"open";
      const campaignName=compact(row.campaignname).slice(0,80);
      if(!reference||!location||quoteValue===null||quoteValue<0||!isoDate(quotedAt)||!isoDate(lastContactAt)||!["open","won","lost"].includes(status)){
        errors.push(`Row ${row.__row}: invalid reference, location, value, date or status.`);
        continue;
      }
      const campaignId=campaignName?campaignByName.get(key(campaignName))||null:null;
      if(campaignName&&!campaignId)warnings.push(`Row ${row.__row}: campaign “${campaignName}” was not found; quotation will remain unattributed.`);
      const normalizedRow={
        reference,
        location,
        quoteValueBwp:quoteValue,
        quotedAt,
        lastContactAt,
        status,
        closedAt:status==="open"?null:(clean(row.closedat)&&isoDate(row.closedat)?clean(row.closedat):lastContactAt),
        campaignId
      };
      const stable=quotationKey(normalizedRow);
      if(seen.has(stable)){
        errors.push(`Row ${row.__row}: duplicate quotation reference/location/date already appears in this CSV.`);
        continue;
      }
      seen.add(stable);
      normalizedRow.__existingId=existing.get(stable)?.id||null;
      if(normalizedRow.__existingId)updates++;else creates++;
      normalized.push(normalizedRow);
    }

    if(sales.opportunities.length+creates>MAX_OPPORTUNITIES){
      errors.push(`Import would exceed the ${MAX_OPPORTUNITIES}-quotation limit.`);
    }
    return {type:"quotations",rows:normalized,errors,warnings,creates,updates,total:normalized.length};
  }

  function planCampaigns(rows,state){
    requireHeaders(rows,["name","monthlyspendbwp"]);
    const company=activeCompany(state);
    if(!company)throw new Error("Active company not found.");
    const sales=ensureSales(company);
    const existing=new Map(sales.campaigns.map(item=>[key(item.name),item]));
    const normalized=[];
    const seen=new Set();
    const errors=[];
    const warnings=[];
    let creates=0,updates=0;

    for(const row of rows){
      const name=compact(row.name).slice(0,80);
      const spend=number(row.monthlyspendbwp);
      const activeRaw=clean(row.active);
      const active=activeRaw===""?true:bool(activeRaw);
      if(!name||spend===null||spend<0||active===null){
        errors.push(`Row ${row.__row}: invalid campaign name, spend or active value.`);
        continue;
      }
      const stable=key(name);
      if(seen.has(stable)){
        errors.push(`Row ${row.__row}: duplicate campaign name already appears in this CSV.`);
        continue;
      }
      seen.add(stable);
      const match=existing.get(stable);
      normalized.push({name,monthlySpendBwp:spend,active,__existingId:match?.id||null});
      if(match)updates++;else creates++;
    }
    if(sales.campaigns.length+creates>MAX_CAMPAIGNS)errors.push(`Import would exceed the ${MAX_CAMPAIGNS}-campaign limit.`);
    if(!rows.length)warnings.push("No campaign data rows were found.");
    return {type:"campaigns",rows:normalized,errors,warnings,creates,updates,total:normalized.length};
  }

  function planFinancialSnapshot(rows,state){
    if(!canImportFinance())throw new Error("Only the business owner can import financial assumptions.");
    if(rows.length!==1)throw new Error("Financial snapshot CSV must contain exactly one data row.");
    const company=activeCompany(state);
    if(!company)throw new Error("Active company not found.");
    const row=rows[0];
    const fields=[];
    const errors=[];
    const warnings=[];
    for(const [logical,keyName] of Object.entries(PROFILE_KEYS)){
      const header=normalizeHeader(logical);
      if(!(header in row))continue;
      if(logical==="plannedPurchaseLabel"){
        fields.push({logical,key:keyName,value:compact(row[header]).slice(0,80)});
        continue;
      }
      const raw=clean(row[header]);
      if(raw==="")continue;
      const value=number(raw);
      if(value===null||value<0){errors.push(`Row ${row.__row}: ${logical} must be a non-negative number.`);continue;}
      if(logical==="operatingDaysPerMonth"&&(value<1||value>31)){errors.push(`Row ${row.__row}: operatingDaysPerMonth must be 1–31.`);continue;}
      if(logical==="sameMonthCollectionPct"&&value>100){errors.push(`Row ${row.__row}: sameMonthCollectionPct must be 0–100.`);continue;}
      fields.push({logical,key:keyName,value});
    }
    if(!fields.length)errors.push("No recognized financial snapshot columns contain values.");
    if(!("currentcashbwp" in row))warnings.push("Current cash was not included; cash-buffer analysis may remain incomplete.");
    return {type:"financial",rows:[row],fields,errors,warnings,creates:0,updates:fields.length,total:1};
  }

  function planImport(type,rows,state){
    if(type==="quotations")return planQuotations(rows,state);
    if(type==="campaigns")return planCampaigns(rows,state);
    if(type==="financial")return planFinancialSnapshot(rows,state);
    throw new Error("Choose a supported import type.");
  }

  function applyPlan(plan,state,fileName){
    const next=clone(state);
    const company=activeCompany(next);
    if(!company)throw new Error("Active company not found.");
    const batchId=uid("import");
    const importedAt=nowIso();

    if(plan.type==="quotations"){
      const sales=ensureSales(company);
      const byId=new Map(sales.opportunities.map(item=>[String(item.id),item]));
      for(const row of plan.rows){
        const imported={
          reference:row.reference,
          location:row.location,
          quoteValueBwp:row.quoteValueBwp,
          quotedAt:row.quotedAt,
          lastContactAt:row.lastContactAt,
          status:row.status,
          closedAt:row.closedAt,
          campaignId:row.campaignId,
          importSource:"csv",
          importBatchId:batchId,
          importedAt,
          updatedAt:importedAt
        };
        if(row.__existingId){Object.assign(byId.get(String(row.__existingId)),imported);}
        else sales.opportunities.unshift({id:uid("quote"),createdAt:importedAt,...imported});
      }
    }else if(plan.type==="campaigns"){
      const sales=ensureSales(company);
      const byId=new Map(sales.campaigns.map(item=>[String(item.id),item]));
      for(const row of plan.rows){
        const imported={
          name:row.name,
          monthlySpendBwp:row.monthlySpendBwp,
          active:row.active,
          importSource:"csv",
          importBatchId:batchId,
          importedAt,
          updatedAt:importedAt
        };
        if(row.__existingId){Object.assign(byId.get(String(row.__existingId)),imported);}
        else sales.campaigns.unshift({id:uid("campaign"),createdAt:importedAt,...imported});
      }
    }else if(plan.type==="financial"){
      company.profile=company.profile&&typeof company.profile==="object"?company.profile:{};
      for(const field of plan.fields)company.profile[field.key]=field.value;
    }

    const history=ensureImportHistory(company);
    history.unshift({
      id:batchId,
      type:plan.type,
      source:"csv",
      fileName:compact(fileName).slice(0,120),
      importedAt,
      role:role(),
      rows:plan.total,
      created:plan.creates,
      updated:plan.updates,
      warnings:plan.warnings.length
    });
    company.dataImports=history.slice(0,MAX_IMPORT_HISTORY);
    return next;
  }

  function templateFor(type){
    if(type==="quotations")return [
      "reference,location,quoteValueBwp,quotedAt,lastContactAt,status,campaignName",
      "QT-1042,Francistown,12500,2026-09-01,2026-09-08,open,Facebook Campaign A"
    ].join("\n");
    if(type==="campaigns")return [
      "name,monthlySpendBwp,active",
      "Facebook Campaign A,4500,true"
    ].join("\n");
    return [
      "monthlyRevenueTargetBwp,operatingDaysPerMonth,currentCashBwp,minimumCashBufferBwp,monthlyCashOutflowsBwp,monthlyLabourCostBwp,plannedPurchaseBwp,sameMonthCollectionPct,plannedPurchaseLabel",
      "120000,26,65000,30000,90000,32000,18000,70,Equipment purchase"
    ].join("\n");
  }

  function downloadTemplate(type){
    const blob=new Blob([templateFor(type)],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download=`thebe-${type}-template.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function summaryCard(label,value){
    const card=document.createElement("div");
    card.className="data-bridge-stat";
    card.append(text("span",label),text("b",value));
    return card;
  }

  function renderPreview(plan,fileName){
    const box=q("#businessDataBridgePreview");
    const apply=q("#businessDataBridgeApply");
    if(!box||!apply)return;
    box.replaceChildren();
    box.hidden=false;
    box.append(text("div",`Preview · ${fileName}`,"section-eyebrow"));

    const stats=document.createElement("div");
    stats.className="data-bridge-stats";
    stats.append(
      summaryCard("Valid rows",String(plan.total)),
      summaryCard("New",String(plan.creates)),
      summaryCard("Updates",String(plan.updates)),
      summaryCard("Warnings",String(plan.warnings.length))
    );
    box.append(stats);

    if(plan.errors.length){
      const errors=document.createElement("div");
      errors.className="data-bridge-messages risk";
      errors.append(text("b",`${plan.errors.length} issue${plan.errors.length===1?"":"s"} must be fixed before import.`));
      plan.errors.slice(0,8).forEach(item=>errors.append(text("span",item)));
      if(plan.errors.length>8)errors.append(text("span",`+ ${plan.errors.length-8} more`));
      box.append(errors);
    }
    if(plan.warnings.length){
      const warnings=document.createElement("div");
      warnings.className="data-bridge-messages";
      warnings.append(text("b","Review these warnings before applying."));
      plan.warnings.slice(0,8).forEach(item=>warnings.append(text("span",item)));
      if(plan.warnings.length>8)warnings.append(text("span",`+ ${plan.warnings.length-8} more`));
      box.append(warnings);
    }

    const note=plan.updates>0
      ?`${plan.updates} existing record${plan.updates===1?" will":"s will"} be updated only after you explicitly apply this import.`
      :"No existing records will be overwritten by this import.";
    box.append(text("p",note,"muted small"));
    apply.disabled=plan.errors.length>0||plan.total===0;
  }

  function setStatus(message,tone=""){
    const node=q("#businessDataBridgeStatus");
    if(!node)return;
    node.textContent=String(message||"");
    node.dataset.tone=tone;
  }

  async function previewSelectedFile(){
    const type=String(q("#businessDataBridgeType")?.value||"");
    const input=q("#businessDataBridgeFile");
    const file=input?.files?.[0];
    activePreview=null;
    if(!file){setStatus("Choose a CSV file first.","risk");return;}
    if(file.size>MAX_FILE_BYTES){setStatus("CSV must be 1 MB or smaller.","risk");return;}
    if(type==="financial"&&!canImportFinance()){setStatus("Only the business owner can import financial assumptions.","risk");return;}
    if(!canImportSales()){setStatus("Your role cannot import business data.","risk");return;}

    try{
      setStatus("Reading CSV locally…");
      const raw=await file.text();
      const rows=parseCsv(raw);
      const envelope=await request("/api/state");
      const plan=planImport(type,rows,envelope?.state||{});
      activePreview={type,rows,fileName:file.name,plan};
      renderPreview(plan,file.name);
      setStatus(plan.errors.length?"Fix the CSV issues before applying.":"Preview ready. Nothing has been saved yet.",plan.errors.length?"risk":"positive");
    }catch(error){
      setStatus(String(error?.message||"Could not preview import").slice(0,220),"risk");
      const box=q("#businessDataBridgePreview");
      if(box){box.hidden=true;box.replaceChildren();}
      const apply=q("#businessDataBridgeApply");if(apply)apply.disabled=true;
    }
  }

  async function applyImport(){
    if(!activePreview)return;
    if(activePreview.type==="financial"&&!canImportFinance()){setStatus("Only the business owner can import financial assumptions.","risk");return;}
    try{
      setStatus("Revalidating against the latest company data…");
      const envelope=await request("/api/state");
      const plan=planImport(activePreview.type,activePreview.rows,envelope?.state||{});
      renderPreview(plan,activePreview.fileName);
      if(plan.errors.length)throw new Error("Import stopped because the latest data no longer passes validation.");
      const next=applyPlan(plan,envelope.state,activePreview.fileName);
      await request("/api/state",{
        method:"PUT",
        body:JSON.stringify({version:envelope.version,state:next})
      });
      setStatus(`Imported ${plan.total} ${plan.type} row${plan.total===1?"":"s"}. The owner brief is refreshing.`,"positive");
      activePreview=null;
      const apply=q("#businessDataBridgeApply");if(apply)apply.disabled=true;
      setTimeout(()=>global.ThebeOwnerCommandCentre?.refresh?.(),80);
    }catch(error){
      setStatus(String(error?.message||"Import failed").slice(0,220),"risk");
    }
  }

  function renderLastImport(company,root){
    const history=Array.isArray(company?.dataImports)?company.dataImports:[];
    const last=history[0];
    if(!last)return;
    const when=String(last.importedAt||"").slice(0,10);
    root.append(text("p",`Last import: ${last.type} · ${last.rows||0} row${Number(last.rows||0)===1?"":"s"} · ${when||"date unavailable"}.`,"muted small"));
  }

  async function ensurePanel(){
    if(ensurePanelPromise)return ensurePanelPromise;
    ensurePanelPromise=(async()=>{
      const body=q("#ownerSalesBody");
      if(!body||!canImportSales())return;
      if(q("#businessDataBridge",body))return;

      const card=document.createElement("details");
      card.id="businessDataBridge";
      card.className="business-data-bridge";
      card.dataset.release=RELEASE;
      card.append(text("summary","Import business data (.csv)"));

      const inner=document.createElement("div");
      inner.className="business-data-bridge-body";
      inner.append(
        text("div","Business data bridge","section-eyebrow"),
        text("h4","Bring existing business records into Thebe without retyping them."),
        text("p","CSV files are read in your browser first. Thebe shows what will be created or updated before any recognized business fields are saved. Raw files are not stored.","muted")
      );

      const controls=document.createElement("div");
      controls.className="data-bridge-controls";
      const typeWrap=document.createElement("label");
      typeWrap.append(text("span","Import type"));
      const typeSelect=document.createElement("select");
      typeSelect.id="businessDataBridgeType";
      [
        ["quotations","Quotations / opportunities"],
        ["campaigns","Campaign spend"],
        ...(canImportFinance()?[["financial","Financial snapshot assumptions"]]:[])
      ].forEach(([value,label])=>{
        const option=document.createElement("option");option.value=value;option.textContent=label;typeSelect.append(option);
      });
      typeWrap.append(typeSelect);

      const fileWrap=document.createElement("label");
      fileWrap.append(text("span","CSV file"));
      const fileInput=document.createElement("input");
      fileInput.id="businessDataBridgeFile";
      fileInput.type="file";
      fileInput.accept=".csv,text/csv";
      fileWrap.append(fileInput);
      controls.append(typeWrap,fileWrap);
      inner.append(controls);

      const actions=document.createElement("div");
      actions.className="data-bridge-actions";
      actions.append(
        button("Download template",()=>downloadTemplate(String(typeSelect.value||"quotations")),"btn alt"),
        button("Preview import",previewSelectedFile,"btn soft")
      );
      const apply=button("Apply import",applyImport,"btn");
      apply.id="businessDataBridgeApply";
      apply.disabled=true;
      actions.append(apply);
      inner.append(actions);

      const status=text("span","Choose a template or select an existing CSV export.","owner-input-status");
      status.id="businessDataBridgeStatus";
      inner.append(status);
      const preview=document.createElement("div");
      preview.id="businessDataBridgePreview";
      preview.className="data-bridge-preview";
      preview.hidden=true;
      inner.append(preview);

      card.append(inner);
      const intro=q(".owner-sales-intro",body);
      if(intro)intro.insertAdjacentElement("afterend",card);else body.prepend(card);

      try{
        const envelope=await request("/api/state");
        renderLastImport(activeCompany(envelope?.state||{}),inner);
      }catch{}
    })();
    try{return await ensurePanelPromise}
    finally{ensurePanelPromise=null}
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    setTimeout(()=>{scheduled=false;ensurePanel();},80);
  }

  function boot(){
    schedule();
    const root=q("#homeDecisionCenter")||document.body;
    new MutationObserver(schedule).observe(root,{subtree:true,childList:true});
    document.addEventListener("change",event=>{
      if(event.target?.id==="companySelect"){activePreview=null;setTimeout(schedule,550);}
      if(event.target?.id==="businessDataBridgeType"){
        activePreview=null;
        const box=q("#businessDataBridgePreview");if(box){box.hidden=true;box.replaceChildren();}
        const apply=q("#businessDataBridgeApply");if(apply)apply.disabled=true;
        setStatus("Choose a CSV file or download the matching template.");
      }
    });
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();

  global.ThebeBusinessDataBridge=Object.freeze({release:RELEASE,refresh:schedule});
})(window);
