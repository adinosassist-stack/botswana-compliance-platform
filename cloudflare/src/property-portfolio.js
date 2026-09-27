import {DEFAULT_RUNTIME_MARKET_CODE,runtimeMarketProfile,marketBusinessDate} from "./market-profile.js";

export const PROPERTY_PORTFOLIO_VERSION="2026-09-27.v175";
const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
const TYPES=new Set(["residential","commercial","industrial","land","mixed_use","other"]);
const TENURES=new Set(["freehold","leasehold","customary","state","other","unknown"]);
const text=(value,max=240)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const integer=value=>Number.isSafeInteger(Number(value))?Number(value):null;
const nonNegative=value=>{const n=integer(value);return n!==null&&n>=0?n:null};
const frozen=value=>Object.freeze(value);

function validDate(value){
  const v=text(value,10);
  if(!ISO_DATE.test(v))return false;
  const d=new Date(v+"T00:00:00Z");
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
function addDaysIso(value,days){
  if(!validDate(value))return null;
  const d=new Date(value+"T00:00:00Z");
  d.setUTCDate(d.getUTCDate()+Number(days||0));
  return d.toISOString().slice(0,10);
}
function activeCurrency(){
  return String(runtimeMarketProfile(DEFAULT_RUNTIME_MARKET_CODE)?.currency||"BWP").toUpperCase().slice(0,3);
}
function assetRoute(pathname){
  const m=String(pathname||"").match(/^\/api\/property\/assets\/([^/]+)$/);
  return m?{assetId:text(m[1],64)}:null;
}
function valuationsRoute(pathname){
  const m=String(pathname||"").match(/^\/api\/property\/assets\/([^/]+)\/professional-valuations$/);
  return m?{assetId:text(m[1],64)}:null;
}
function performanceHistoryRoute(pathname){
  const m=String(pathname||"").match(/^\/api\/property\/assets\/([^/]+)\/performance-history$/);
  return m?{assetId:text(m[1],64)}:null;
}
function evidenceReady(row){
  return !!row?.evidence_id
    &&String(row?.evidence_review_status||"")==="approved"
    &&String(row?.evidence_scan_status||"")==="clean"
    &&!!row?.evidence_scanned_at
    &&!row?.evidence_malware_name
    &&!row?.evidence_deleted_at;
}
function renewalStatus(valuationDate,reviewDueDate,businessDate){
  if(!valuationDate)return "missing";
  const due=validDate(reviewDueDate)?reviewDueDate:addDaysIso(valuationDate,365);
  if(!due)return "unknown";
  if(due<businessDate)return "due";
  const delta=Math.floor((Date.parse(due+"T00:00:00Z")-Date.parse(businessDate+"T00:00:00Z"))/86400000);
  return delta<=60?"due_soon":"current";
}
function normalizedType(value){const v=text(value,32).toLowerCase();return TYPES.has(v)?v:null}
function normalizedTenure(value){const v=text(value,32).toLowerCase();return TENURES.has(v)?v:null}

export function derivePortfolioMetrics(rows=[],{businessDate=marketBusinessDate(new Date(),DEFAULT_RUNTIME_MARKET_CODE)}={}){
  const active=(Array.isArray(rows)?rows:[]).filter(row=>String(row?.status||"active")==="active");
  const cutoff=new Date(businessDate+"T00:00:00Z");cutoff.setUTCDate(cutoff.getUTCDate()-365);
  let acquisition=0,rent=0,opex=0,debt=0,professionalValue=0,valuedDebt=0,valued=0,stale=0;
  let renewalDue=0,renewalDueSoon=0,evidenceGaps=0;
  for(const row of active){
    acquisition+=Number(row?.acquisition_cost_minor||0);
    rent+=Number(row?.annual_rent_minor||0);
    opex+=Number(row?.annual_operating_cost_minor||0);
    debt+=Number(row?.debt_balance_minor||0);
    const value=Number(row?.market_value_minor||0);
    if(value>0){
      valued++;professionalValue+=value;valuedDebt+=Number(row?.debt_balance_minor||0);
      const d=Date.parse(String(row?.valuation_date||"")+"T00:00:00Z");
      if(Number.isFinite(d)&&d<cutoff.getTime())stale++;
      const renewal=renewalStatus(row?.valuation_date,row?.review_due_date,businessDate);
      if(renewal==="due")renewalDue++;
      else if(renewal==="due_soon")renewalDueSoon++;
      if(!evidenceReady(row))evidenceGaps++;
    }
  }
  const unvalued=Math.max(0,active.length-valued);
  return frozen({
    assetCount:active.length,
    valuedAssetCount:valued,
    unvaluedAssetCount:unvalued,
    staleProfessionalValuationCount:stale,
    professionalValuationRenewalDueCount:renewalDue,
    professionalValuationRenewalDueSoonCount:renewalDueSoon,
    valuationReportEvidenceGapCount:evidenceGaps,
    acquisitionCostMinor:acquisition,
    annualRentMinor:rent,
    annualOperatingCostMinor:opex,
    netOperatingIncomeProxyMinor:rent-opex,
    debtBalanceMinor:debt,
    recordedProfessionalValueMinor:professionalValue,
    valuationCoveragePct:active.length?Math.round((valued/active.length)*1000)/10:null,
    debtToRecordedProfessionalValueRatio:professionalValue>0?Math.round((valuedDebt/professionalValue)*10000)/10000:null
  });
}

export async function propertyPortfolioSummary(env,tenantId,{businessDate=marketBusinessDate(new Date(),DEFAULT_RUNTIME_MARKET_CODE),limit=100}={}){
  const cap=Math.min(200,Math.max(1,Number(limit)||100));
  try{
    const rows=await env.DB.prepare(
      "SELECT a.id,a.asset_code,a.name,a.property_type,a.location_text,a.tenure_type,a.currency,a.acquisition_date,a.acquisition_cost_minor,"+
      "a.annual_rent_minor,a.annual_operating_cost_minor,a.debt_balance_minor,a.status,a.archived_at,a.archived_by_user_id,a.archive_reason,a.created_at,a.updated_at,"+
      "v.id valuation_id,v.valuation_date,v.market_value_minor,v.valuer_name,v.valuer_registration_ref,v.report_reference,v.review_due_date,v.review_due_source,v.created_at valuation_recorded_at,"+
      "e.id evidence_id,e.display_name evidence_display_name,e.review_status evidence_review_status,e.scan_status evidence_scan_status,e.scanned_at evidence_scanned_at,e.malware_name evidence_malware_name,e.deleted_at evidence_deleted_at "+
      "FROM property_assets a LEFT JOIN property_professional_valuations v ON v.id=("+
      "SELECT v2.id FROM property_professional_valuations v2 WHERE v2.tenant_id=a.tenant_id AND v2.property_id=a.id "+
      "ORDER BY v2.valuation_date DESC,v2.created_at DESC,v2.id DESC LIMIT 1) "+
      "LEFT JOIN property_valuation_evidence_links l ON l.tenant_id=a.tenant_id AND l.property_id=a.id AND l.valuation_id=v.id AND l.link_kind='signed_report' "+
      "LEFT JOIN evidence e ON e.tenant_id=a.tenant_id AND e.id=l.evidence_id "+
      "WHERE a.tenant_id=? ORDER BY a.status ASC,a.name ASC LIMIT ?"
    ).bind(tenantId,cap).all();
    const metricRows=await env.DB.prepare(
      "SELECT a.acquisition_cost_minor,a.annual_rent_minor,a.annual_operating_cost_minor,a.debt_balance_minor,a.status,"+
      "v.valuation_date,v.review_due_date,v.market_value_minor,e.id evidence_id,e.review_status evidence_review_status,e.scan_status evidence_scan_status,e.scanned_at evidence_scanned_at,e.malware_name evidence_malware_name,e.deleted_at evidence_deleted_at "+
      "FROM property_assets a LEFT JOIN property_professional_valuations v ON v.id=("+
      "SELECT v2.id FROM property_professional_valuations v2 WHERE v2.tenant_id=a.tenant_id AND v2.property_id=a.id "+
      "ORDER BY v2.valuation_date DESC,v2.created_at DESC,v2.id DESC LIMIT 1) "+
      "LEFT JOIN property_valuation_evidence_links l ON l.tenant_id=a.tenant_id AND l.property_id=a.id AND l.valuation_id=v.id AND l.link_kind='signed_report' "+
      "LEFT JOIN evidence e ON e.tenant_id=a.tenant_id AND e.id=l.evidence_id "+
      "WHERE a.tenant_id=? AND a.status='active'"
    ).bind(tenantId).all();
    const items=(rows.results||[]).map(row=>frozen({
      id:String(row.id||""),assetCode:row.asset_code||null,name:text(row.name,160),propertyType:text(row.property_type,32),
      location:text(row.location_text,240),tenureType:text(row.tenure_type,32),currency:text(row.currency,3),
      acquisitionDate:row.acquisition_date||null,acquisitionCostMinor:row.acquisition_cost_minor==null?null:Number(row.acquisition_cost_minor),
      annualRentMinor:Number(row.annual_rent_minor||0),annualOperatingCostMinor:Number(row.annual_operating_cost_minor||0),
      debtBalanceMinor:Number(row.debt_balance_minor||0),status:text(row.status,16),
      archivedAt:row.archived_at||null,archivedByUserId:row.archived_by_user_id||null,archiveReason:row.archive_reason||null,
      latestProfessionalValuation:row.valuation_id?frozen({
        id:String(row.valuation_id),valuationDate:row.valuation_date||null,marketValueMinor:Number(row.market_value_minor||0),
        valuerName:text(row.valuer_name,160),valuerRegistrationRef:text(row.valuer_registration_ref,120),
        reportReference:text(row.report_reference,160),reviewDueDate:row.review_due_date||addDaysIso(row.valuation_date,365),
        reviewDueSource:text(row.review_due_source,32)||"thebe_policy_365d",renewalStatus:renewalStatus(row.valuation_date,row.review_due_date,businessDate),
        recordedAt:row.valuation_recorded_at||null,
        reportEvidence:row.evidence_id?frozen({
          id:String(row.evidence_id),displayName:text(row.evidence_display_name,240),
          reviewStatus:text(row.evidence_review_status,32),scanStatus:text(row.evidence_scan_status,32),
          scannedAt:row.evidence_scanned_at||null,ready:evidenceReady(row)
        }):null,
        reportEvidenceReady:evidenceReady(row),
        sourceKind:"external_professional_report",thebeCertified:false,professionalCredentialVerifiedByThebe:false
      }):null
    }));
    const metrics=derivePortfolioMetrics(metricRows.results||[],{businessDate});
    return frozen({
      available:true,version:PROPERTY_PORTFOLIO_VERSION,businessDate,currency:activeCurrency(),...metrics,
      items:frozen(items),
      authority:frozen({
        canonicalRegister:true,professionalValuesOnlyFromRecordedExternalReports:true,
        thebeMarketValuation:false,thebeCertification:false,executionAllowed:false,
        registeredValuerReportRequired:true,professionalCredentialVerifiedByThebe:false
      })
    });
  }catch{
    return frozen({
      available:false,version:PROPERTY_PORTFOLIO_VERSION,businessDate,currency:activeCurrency(),
      assetCount:0,valuedAssetCount:0,unvaluedAssetCount:0,staleProfessionalValuationCount:0,
      professionalValuationRenewalDueCount:0,professionalValuationRenewalDueSoonCount:0,valuationReportEvidenceGapCount:0,
      items:frozen([]),error:"property_portfolio_unavailable",
      authority:frozen({canonicalRegister:false,thebeMarketValuation:false,thebeCertification:false,executionAllowed:false})
    });
  }
}

export async function handlePropertyPortfolioRequest({request,url,env,auth,json,readJson,id,writeAudit,roleAllowed=()=>false}={}){
  const path=String(url?.pathname||"");
  if(!path.startsWith("/api/property/"))return null;
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);

  if(path==="/api/property/portfolio"&&request.method==="GET"){
    return json(await propertyPortfolioSummary(env,auth.tenant_id));
  }

  if(path==="/api/property/assets"&&request.method==="POST"){
    const body=await readJson(request,{maxBytes:16*1024});
    const name=text(body.name,160),assetCode=text(body.assetCode,80)||null,propertyType=normalizedType(body.propertyType||"other"),
      tenureType=normalizedTenure(body.tenureType||"unknown"),location=text(body.location,240),currency=activeCurrency();
    const acquisitionDate=text(body.acquisitionDate,10)||null;
    const acquisitionCostMinor=body.acquisitionCostMinor==null?null:nonNegative(body.acquisitionCostMinor);
    const annualRentMinor=nonNegative(body.annualRentMinor??0),annualOperatingCostMinor=nonNegative(body.annualOperatingCostMinor??0),
      debtBalanceMinor=nonNegative(body.debtBalanceMinor??0);
    if(name.length<2)return json({error:"property_name_required"},400);
    if(!propertyType||!tenureType)return json({error:"invalid_property_classification"},400);
    if(acquisitionDate&&!validDate(acquisitionDate))return json({error:"invalid_acquisition_date"},400);
    if((body.acquisitionCostMinor!=null&&acquisitionCostMinor===null)||annualRentMinor===null||annualOperatingCostMinor===null||debtBalanceMinor===null)
      return json({error:"invalid_property_amount"},400);
    const propertyId=id(),snapshotId=id(),businessDate=marketBusinessDate(new Date(),DEFAULT_RUNTIME_MARKET_CODE);
    try{
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO property_assets(id,tenant_id,asset_code,name,property_type,location_text,tenure_type,currency,acquisition_date,acquisition_cost_minor,annual_rent_minor,annual_operating_cost_minor,debt_balance_minor,status,created_by_user_id) "+
          "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?)"
        ).bind(propertyId,auth.tenant_id,assetCode,name,propertyType,location,tenureType,currency,acquisitionDate,acquisitionCostMinor,annualRentMinor,annualOperatingCostMinor,debtBalanceMinor,auth.user_id),
        env.DB.prepare(
          "INSERT INTO property_operating_snapshots(id,tenant_id,property_id,snapshot_date,currency,annual_rent_minor,annual_operating_cost_minor,debt_balance_minor,source_kind,created_by_user_id) "+
          "VALUES(?,?,?,?,?,?,?,?,'property_register_create',?)"
        ).bind(snapshotId,auth.tenant_id,propertyId,businessDate,currency,annualRentMinor,annualOperatingCostMinor,debtBalanceMinor,auth.user_id)
      ]);
    }catch(error){
      if(/unique|constraint/i.test(String(error)))return json({error:"property_asset_conflict"},409);
      return json({error:"property_asset_write_failed"},503);
    }
    await writeAudit(env,auth.tenant_id,auth.user_id,"PROPERTY_ASSET_CREATED",{propertyId,assetCode,propertyType,tenureType,currency});
    return json({ok:true,id:propertyId,name,assetCode,propertyType,tenureType,currency},201);
  }

  const asset=assetRoute(path);
  if(asset&&request.method==="PATCH"){
    const body=await readJson(request,{maxBytes:16*1024});
    const current=await env.DB.prepare("SELECT id,asset_code,name,property_type,location_text,tenure_type,currency,acquisition_date,acquisition_cost_minor,annual_rent_minor,annual_operating_cost_minor,debt_balance_minor,status,archived_at,archived_by_user_id,archive_reason FROM property_assets WHERE tenant_id=? AND id=? LIMIT 1").bind(auth.tenant_id,asset.assetId).first();
    if(!current)return json({error:"property_asset_not_found"},404);
    const next={
      assetCode:body.assetCode===undefined?current.asset_code:(text(body.assetCode,80)||null),
      name:body.name===undefined?current.name:text(body.name,160),
      propertyType:body.propertyType===undefined?current.property_type:normalizedType(body.propertyType),
      location:body.location===undefined?current.location_text:text(body.location,240),
      tenureType:body.tenureType===undefined?current.tenure_type:normalizedTenure(body.tenureType),
      acquisitionDate:body.acquisitionDate===undefined?current.acquisition_date:(text(body.acquisitionDate,10)||null),
      acquisitionCostMinor:body.acquisitionCostMinor===undefined?current.acquisition_cost_minor:(body.acquisitionCostMinor==null?null:nonNegative(body.acquisitionCostMinor)),
      annualRentMinor:body.annualRentMinor===undefined?Number(current.annual_rent_minor||0):nonNegative(body.annualRentMinor),
      annualOperatingCostMinor:body.annualOperatingCostMinor===undefined?Number(current.annual_operating_cost_minor||0):nonNegative(body.annualOperatingCostMinor),
      debtBalanceMinor:body.debtBalanceMinor===undefined?Number(current.debt_balance_minor||0):nonNegative(body.debtBalanceMinor),
      status:body.status===undefined?current.status:text(body.status,16),
      archiveReason:body.archiveReason===undefined?text(current.archive_reason,500):text(body.archiveReason,500)
    };
    if(next.name.length<2||!next.propertyType||!next.tenureType||!["active","archived"].includes(next.status))return json({error:"invalid_property_update"},400);
    const statusChanged=String(next.status)!==String(current.status);
    if(statusChanged&&!roleAllowed(auth,"owner"))return json({error:"owner_required_for_property_status"},403);
    if(statusChanged&&next.status==="archived"&&next.archiveReason.length<3)return json({error:"property_archive_reason_required"},400);
    if(next.acquisitionDate&&!validDate(next.acquisitionDate))return json({error:"invalid_acquisition_date"},400);
    if((body.acquisitionCostMinor!==undefined&&body.acquisitionCostMinor!==null&&next.acquisitionCostMinor===null)||next.annualRentMinor===null||next.annualOperatingCostMinor===null||next.debtBalanceMinor===null)
      return json({error:"invalid_property_amount"},400);
    const financialChanged=
      Number(next.annualRentMinor)!==Number(current.annual_rent_minor||0)
      ||Number(next.annualOperatingCostMinor)!==Number(current.annual_operating_cost_minor||0)
      ||Number(next.debtBalanceMinor)!==Number(current.debt_balance_minor||0);
    const archivedAt=next.status==="archived"?(current.archived_at||new Date().toISOString()):null;
    const archivedByUserId=next.status==="archived"?(current.archived_by_user_id||auth.user_id):null;
    const archiveReason=next.status==="archived"?next.archiveReason:null;
    const statements=[
      env.DB.prepare(
        "UPDATE property_assets SET asset_code=?,name=?,property_type=?,location_text=?,tenure_type=?,acquisition_date=?,acquisition_cost_minor=?,annual_rent_minor=?,annual_operating_cost_minor=?,debt_balance_minor=?,status=?,archived_at=?,archived_by_user_id=?,archive_reason=?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=?"
      ).bind(next.assetCode,next.name,next.propertyType,next.location,next.tenureType,next.acquisitionDate,next.acquisitionCostMinor,next.annualRentMinor,next.annualOperatingCostMinor,next.debtBalanceMinor,next.status,archivedAt,archivedByUserId,archiveReason,auth.tenant_id,asset.assetId)
    ];
    if(financialChanged){
      statements.push(env.DB.prepare(
        "INSERT INTO property_operating_snapshots(id,tenant_id,property_id,snapshot_date,currency,annual_rent_minor,annual_operating_cost_minor,debt_balance_minor,source_kind,created_by_user_id) "+
        "VALUES(?,?,?,?,?,?,?,?,'property_register_update',?)"
      ).bind(id(),auth.tenant_id,asset.assetId,marketBusinessDate(new Date(),DEFAULT_RUNTIME_MARKET_CODE),String(current.currency||activeCurrency()),next.annualRentMinor,next.annualOperatingCostMinor,next.debtBalanceMinor,auth.user_id));
    }
    try{
      await env.DB.batch(statements);
    }catch(error){
      if(/UNIQUE|constraint/i.test(String(error)))return json({error:"property_asset_conflict"},409);
      return json({error:"property_asset_update_failed"},503);
    }
    await writeAudit(env,auth.tenant_id,auth.user_id,statusChanged?"PROPERTY_ASSET_STATUS_CHANGED":"PROPERTY_ASSET_UPDATED",{
      propertyId:asset.assetId,assetCode:next.assetCode,fromStatus:current.status,toStatus:next.status,financialSnapshotRecorded:financialChanged,archiveReason:archiveReason||null
    });
    return json({ok:true,id:asset.assetId,...next,archivedAt,archivedByUserId,financialSnapshotRecorded:financialChanged});
  }

  const performanceHistory=performanceHistoryRoute(path);
  if(performanceHistory&&request.method==="GET"){
    const assetRow=await env.DB.prepare(
      "SELECT id,name,currency,status,annual_rent_minor,annual_operating_cost_minor,debt_balance_minor FROM property_assets WHERE tenant_id=? AND id=? LIMIT 1"
    ).bind(auth.tenant_id,performanceHistory.assetId).first();
    if(!assetRow)return json({error:"property_asset_not_found"},404);
    const [snapshots,valuations]=await Promise.all([
      env.DB.prepare(
        "SELECT id,snapshot_date,annual_rent_minor,annual_operating_cost_minor,debt_balance_minor,source_kind,created_at "+
        "FROM property_operating_snapshots WHERE tenant_id=? AND property_id=? ORDER BY snapshot_date ASC,created_at ASC,id ASC LIMIT 120"
      ).bind(auth.tenant_id,performanceHistory.assetId).all(),
      env.DB.prepare(
        "SELECT v.id,v.valuation_date,v.market_value_minor,v.review_due_date,v.review_due_source,v.report_reference,v.valuer_name,"+
        "e.id evidence_id,e.display_name evidence_display_name,e.review_status evidence_review_status,e.scan_status evidence_scan_status,e.scanned_at evidence_scanned_at,e.malware_name evidence_malware_name,e.deleted_at evidence_deleted_at "+
        "FROM property_professional_valuations v "+
        "LEFT JOIN property_valuation_evidence_links l ON l.tenant_id=v.tenant_id AND l.property_id=v.property_id AND l.valuation_id=v.id AND l.link_kind='signed_report' "+
        "LEFT JOIN evidence e ON e.tenant_id=v.tenant_id AND e.id=l.evidence_id "+
        "WHERE v.tenant_id=? AND v.property_id=? ORDER BY v.valuation_date ASC,v.created_at ASC,v.id ASC LIMIT 120"
      ).bind(auth.tenant_id,performanceHistory.assetId).all()
    ]);
    const operating=(snapshots.results||[]).map(row=>frozen({
      id:String(row.id||""),snapshotDate:row.snapshot_date||null,
      annualRentMinor:Number(row.annual_rent_minor||0),annualOperatingCostMinor:Number(row.annual_operating_cost_minor||0),
      netOperatingIncomeProxyMinor:Number(row.annual_rent_minor||0)-Number(row.annual_operating_cost_minor||0),
      debtBalanceMinor:Number(row.debt_balance_minor||0),sourceKind:text(row.source_kind,40),recordedAt:row.created_at||null
    }));
    const values=(valuations.results||[]).map(row=>frozen({
      id:String(row.id||""),valuationDate:row.valuation_date||null,marketValueMinor:Number(row.market_value_minor||0),
      reviewDueDate:row.review_due_date||addDaysIso(row.valuation_date,365),reviewDueSource:text(row.review_due_source,32)||"thebe_policy_365d",
      renewalStatus:renewalStatus(row.valuation_date,row.review_due_date,marketBusinessDate(new Date(),DEFAULT_RUNTIME_MARKET_CODE)),
      reportReference:text(row.report_reference,160),valuerName:text(row.valuer_name,160),
      reportEvidence:row.evidence_id?frozen({id:String(row.evidence_id),displayName:text(row.evidence_display_name,240),ready:evidenceReady(row)}):null
    }));
    const first=operating[0]||null,last=operating.at(-1)||null;
    const percentChange=(current,baseline)=>baseline!==0?Math.round(((current-baseline)/Math.abs(baseline))*1000)/10:null;
    const latestValue=values.at(-1)?.marketValueMinor||0;
    const currentNoi=Number(assetRow.annual_rent_minor||0)-Number(assetRow.annual_operating_cost_minor||0);
    return json({
      available:true,property:{id:String(assetRow.id),name:text(assetRow.name,160),currency:text(assetRow.currency,3),status:text(assetRow.status,16)},
      operatingSnapshots:operating,professionalValueHistory:values,
      current:{
        annualRentMinor:Number(assetRow.annual_rent_minor||0),annualOperatingCostMinor:Number(assetRow.annual_operating_cost_minor||0),
        netOperatingIncomeProxyMinor:currentNoi,debtBalanceMinor:Number(assetRow.debt_balance_minor||0),
        grossRentYieldPct:latestValue>0?Math.round((Number(assetRow.annual_rent_minor||0)/latestValue)*10000)/100:null,
        netOperatingYieldPct:latestValue>0?Math.round((currentNoi/latestValue)*10000)/100:null
      },
      trend:first&&last&&first.id!==last.id?{
        annualRentChangePct:percentChange(last.annualRentMinor,first.annualRentMinor),
        netOperatingIncomeProxyChangePct:percentChange(last.netOperatingIncomeProxyMinor,first.netOperatingIncomeProxyMinor),
        debtBalanceChangePct:percentChange(last.debtBalanceMinor,first.debtBalanceMinor),
        fromDate:first.snapshotDate,toDate:last.snapshotDate
      }:null,
      authority:{accountingProfitClaim:false,propertyMarketValuation:false,operatingTrendBasis:"owner_recorded_property_register_snapshots",professionalValueBasis:"recorded_external_professional_reports_only"}
    });
  }

  const valuations=valuationsRoute(path);
  if(valuations&&request.method==="GET"){
    const rows=await env.DB.prepare(
      "SELECT v.id,v.valuation_date,v.market_value_minor,v.currency,v.valuer_name,v.valuer_registration_ref,v.report_reference,v.methodology_note,v.review_due_date,v.review_due_source,v.source_kind,v.created_at,"+
      "e.id evidence_id,e.display_name evidence_display_name,e.review_status evidence_review_status,e.scan_status evidence_scan_status,e.scanned_at evidence_scanned_at,e.malware_name evidence_malware_name,e.deleted_at evidence_deleted_at "+
      "FROM property_professional_valuations v "+
      "LEFT JOIN property_valuation_evidence_links l ON l.tenant_id=v.tenant_id AND l.property_id=v.property_id AND l.valuation_id=v.id AND l.link_kind='signed_report' "+
      "LEFT JOIN evidence e ON e.tenant_id=v.tenant_id AND e.id=l.evidence_id "+
      "WHERE v.tenant_id=? AND v.property_id=? ORDER BY v.valuation_date DESC,v.created_at DESC LIMIT 50"
    ).bind(auth.tenant_id,valuations.assetId).all();
    const businessDate=marketBusinessDate(new Date(),DEFAULT_RUNTIME_MARKET_CODE);
    const items=(rows.results||[]).map(row=>({
      id:row.id,valuation_date:row.valuation_date,market_value_minor:Number(row.market_value_minor||0),currency:row.currency,
      valuer_name:row.valuer_name,valuer_registration_ref:row.valuer_registration_ref,report_reference:row.report_reference,
      methodology_note:row.methodology_note,review_due_date:row.review_due_date||addDaysIso(row.valuation_date,365),
      review_due_source:row.review_due_source||"thebe_policy_365d",renewal_status:renewalStatus(row.valuation_date,row.review_due_date,businessDate),
      source_kind:row.source_kind,created_at:row.created_at,
      report_evidence:row.evidence_id?{id:row.evidence_id,display_name:row.evidence_display_name,review_status:row.evidence_review_status,scan_status:row.evidence_scan_status,scanned_at:row.evidence_scanned_at,ready:evidenceReady(row)}:null
    }));
    return json({items,authority:{professionalValuesOnlyFromRecordedExternalReports:true,thebeMarketValuation:false,thebeCertification:false,professionalCredentialVerifiedByThebe:false,reportEvidenceMustBeApprovedAndScanClean:true}});
  }

  if(valuations&&request.method==="POST"){
    if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
    const body=await readJson(request,{maxBytes:16*1024}),valuationDate=text(body.valuationDate,10),
      marketValueMinor=integer(body.marketValueMinor),valuerName=text(body.valuerName,160),
      valuerRegistrationRef=text(body.valuerRegistrationRef,120),reportReference=text(body.reportReference,160),
      methodologyNote=text(body.methodologyNote,500),requestedReviewDueDate=text(body.reviewDueDate,10),
      evidenceId=text(body.evidenceId,64),currency=activeCurrency();
    if(!validDate(valuationDate))return json({error:"invalid_valuation_date"},400);
    const businessDate=marketBusinessDate(new Date(),DEFAULT_RUNTIME_MARKET_CODE);
    if(valuationDate>businessDate)return json({error:"valuation_date_in_future"},400);
    if(marketValueMinor===null||marketValueMinor<=0)return json({error:"invalid_market_value"},400);
    if(valuerName.length<2||valuerRegistrationRef.length<2||reportReference.length<2)return json({error:"professional_report_details_required"},400);
    if(requestedReviewDueDate&&!validDate(requestedReviewDueDate))return json({error:"invalid_valuation_review_due_date"},400);
    if(requestedReviewDueDate&&requestedReviewDueDate<valuationDate)return json({error:"valuation_review_due_before_valuation"},400);
    const reviewDueDate=requestedReviewDueDate||addDaysIso(valuationDate,365);
    const reviewDueSource=requestedReviewDueDate?"professional_report":"thebe_policy_365d";
    const property=await env.DB.prepare("SELECT id,currency,status FROM property_assets WHERE tenant_id=? AND id=? LIMIT 1").bind(auth.tenant_id,valuations.assetId).first();
    if(!property||property.status!=="active")return json({error:"property_asset_not_found"},404);
    if(String(property.currency)!==currency)return json({error:"property_currency_mismatch"},409);
    let evidence=null;
    if(evidenceId){
      evidence=await env.DB.prepare(
        "SELECT id,display_name,review_status,scan_status,scanned_at,malware_name,deleted_at FROM evidence WHERE tenant_id=? AND id=? LIMIT 1"
      ).bind(auth.tenant_id,evidenceId).first();
      if(!evidence||!evidenceReady({
        evidence_id:evidence.id,evidence_review_status:evidence.review_status,evidence_scan_status:evidence.scan_status,
        evidence_scanned_at:evidence.scanned_at,evidence_malware_name:evidence.malware_name,evidence_deleted_at:evidence.deleted_at
      }))return json({error:"valuation_report_evidence_not_ready"},409);
    }
    const valuationId=id();
    const statements=[
      env.DB.prepare(
        "INSERT INTO property_professional_valuations(id,tenant_id,property_id,valuation_date,market_value_minor,currency,valuer_name,valuer_registration_ref,report_reference,methodology_note,review_due_date,review_due_source,source_kind,created_by_user_id) "+
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'external_professional_report',?)"
      ).bind(valuationId,auth.tenant_id,valuations.assetId,valuationDate,marketValueMinor,currency,valuerName,valuerRegistrationRef,reportReference,methodologyNote,reviewDueDate,reviewDueSource,auth.user_id)
    ];
    if(evidenceId)statements.push(env.DB.prepare(
      "INSERT INTO property_valuation_evidence_links(tenant_id,property_id,valuation_id,evidence_id,link_kind,linked_by_user_id) VALUES(?,?,?,?, 'signed_report',?)"
    ).bind(auth.tenant_id,valuations.assetId,valuationId,evidenceId,auth.user_id));
    try{
      await env.DB.batch(statements);
    }catch(error){
      const message=String(error);
      if(message.includes("property_valuation_currency_mismatch"))return json({error:"property_currency_mismatch"},409);
      if(message.includes("property_valuation_review_due_invalid"))return json({error:"invalid_valuation_review_due_date"},409);
      if(message.includes("property_valuation_evidence_not_ready"))return json({error:"valuation_report_evidence_not_ready"},409);
      if(message.includes("property_valuation_evidence_valuation_mismatch"))return json({error:"valuation_report_evidence_mismatch"},409);
      if(/UNIQUE/i.test(message))return json({error:"professional_valuation_conflict"},409);
      return json({error:"professional_valuation_record_failed"},503);
    }
    await writeAudit(env,auth.tenant_id,auth.user_id,"PROPERTY_PROFESSIONAL_VALUATION_RECORDED",{
      propertyId:valuations.assetId,valuationId,valuationDate,marketValueMinor,currency,reportReference,valuerRegistrationRef,
      reviewDueDate,reviewDueSource,evidenceId:evidenceId||null,reportEvidenceReady:!!evidenceId,
      sourceKind:"external_professional_report",thebeCertified:false,professionalCredentialVerifiedByThebe:false
    });
    return json({ok:true,id:valuationId,propertyId:valuations.assetId,valuationDate,marketValueMinor,currency,reviewDueDate,reviewDueSource,evidenceId:evidenceId||null,reportEvidenceReady:!!evidenceId,sourceKind:"external_professional_report",thebeCertified:false},201);
  }

  return json({error:"not_found"},404);
}

export const __propertyPortfolioTest=frozen({validDate,addDaysIso,normalizedType,normalizedTenure,evidenceReady,renewalStatus,derivePortfolioMetrics});
