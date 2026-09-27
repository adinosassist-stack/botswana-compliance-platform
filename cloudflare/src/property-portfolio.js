import {DEFAULT_RUNTIME_MARKET_CODE,runtimeMarketProfile,marketBusinessDate} from "./market-profile.js";

export const PROPERTY_PORTFOLIO_VERSION="2026-09-27.v174";
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
function normalizedType(value){const v=text(value,32).toLowerCase();return TYPES.has(v)?v:null}
function normalizedTenure(value){const v=text(value,32).toLowerCase();return TENURES.has(v)?v:null}

export function derivePortfolioMetrics(rows=[],{businessDate=marketBusinessDate(new Date(),DEFAULT_RUNTIME_MARKET_CODE)}={}){
  const active=(Array.isArray(rows)?rows:[]).filter(row=>String(row?.status||"active")==="active");
  const cutoff=new Date(businessDate+"T00:00:00Z");cutoff.setUTCDate(cutoff.getUTCDate()-365);
  let acquisition=0,rent=0,opex=0,debt=0,professionalValue=0,valuedDebt=0,valued=0,stale=0;
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
    }
  }
  const unvalued=Math.max(0,active.length-valued);
  return frozen({
    assetCount:active.length,
    valuedAssetCount:valued,
    unvaluedAssetCount:unvalued,
    staleProfessionalValuationCount:stale,
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
      "a.annual_rent_minor,a.annual_operating_cost_minor,a.debt_balance_minor,a.status,a.created_at,a.updated_at,"+
      "v.id valuation_id,v.valuation_date,v.market_value_minor,v.valuer_name,v.valuer_registration_ref,v.report_reference,v.created_at valuation_recorded_at "+
      "FROM property_assets a LEFT JOIN property_professional_valuations v ON v.id=("+
      "SELECT v2.id FROM property_professional_valuations v2 WHERE v2.tenant_id=a.tenant_id AND v2.property_id=a.id "+
      "ORDER BY v2.valuation_date DESC,v2.created_at DESC,v2.id DESC LIMIT 1) "+
      "WHERE a.tenant_id=? ORDER BY a.status ASC,a.name ASC LIMIT ?"
    ).bind(tenantId,cap).all();
    const items=(rows.results||[]).map(row=>frozen({
      id:String(row.id||""),assetCode:row.asset_code||null,name:text(row.name,160),propertyType:text(row.property_type,32),
      location:text(row.location_text,240),tenureType:text(row.tenure_type,32),currency:text(row.currency,3),
      acquisitionDate:row.acquisition_date||null,acquisitionCostMinor:row.acquisition_cost_minor==null?null:Number(row.acquisition_cost_minor),
      annualRentMinor:Number(row.annual_rent_minor||0),annualOperatingCostMinor:Number(row.annual_operating_cost_minor||0),
      debtBalanceMinor:Number(row.debt_balance_minor||0),status:text(row.status,16),
      latestProfessionalValuation:row.valuation_id?frozen({
        id:String(row.valuation_id),valuationDate:row.valuation_date||null,marketValueMinor:Number(row.market_value_minor||0),
        valuerName:text(row.valuer_name,160),valuerRegistrationRef:text(row.valuer_registration_ref,120),
        reportReference:text(row.report_reference,160),recordedAt:row.valuation_recorded_at||null,
        sourceKind:"external_professional_report",thebeCertified:false,professionalCredentialVerifiedByThebe:false
      }):null
    }));
    const metrics=derivePortfolioMetrics(items.map(item=>({
      status:item.status,acquisition_cost_minor:item.acquisitionCostMinor,annual_rent_minor:item.annualRentMinor,
      annual_operating_cost_minor:item.annualOperatingCostMinor,debt_balance_minor:item.debtBalanceMinor,
      market_value_minor:item.latestProfessionalValuation?.marketValueMinor||0,
      valuation_date:item.latestProfessionalValuation?.valuationDate||null
    })),{businessDate});
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
    const propertyId=id();
    try{
      await env.DB.prepare(
        "INSERT INTO property_assets(id,tenant_id,asset_code,name,property_type,location_text,tenure_type,currency,acquisition_date,acquisition_cost_minor,annual_rent_minor,annual_operating_cost_minor,debt_balance_minor,status,created_by_user_id) "+
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?)"
      ).bind(propertyId,auth.tenant_id,assetCode,name,propertyType,location,tenureType,currency,acquisitionDate,acquisitionCostMinor,annualRentMinor,annualOperatingCostMinor,debtBalanceMinor,auth.user_id).run();
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
    const current=await env.DB.prepare("SELECT id,name,property_type,location_text,tenure_type,acquisition_date,acquisition_cost_minor,annual_rent_minor,annual_operating_cost_minor,debt_balance_minor,status FROM property_assets WHERE tenant_id=? AND id=? LIMIT 1").bind(auth.tenant_id,asset.assetId).first();
    if(!current)return json({error:"property_asset_not_found"},404);
    const next={
      name:body.name===undefined?current.name:text(body.name,160),
      propertyType:body.propertyType===undefined?current.property_type:normalizedType(body.propertyType),
      location:body.location===undefined?current.location_text:text(body.location,240),
      tenureType:body.tenureType===undefined?current.tenure_type:normalizedTenure(body.tenureType),
      acquisitionDate:body.acquisitionDate===undefined?current.acquisition_date:(text(body.acquisitionDate,10)||null),
      acquisitionCostMinor:body.acquisitionCostMinor===undefined?current.acquisition_cost_minor:(body.acquisitionCostMinor==null?null:nonNegative(body.acquisitionCostMinor)),
      annualRentMinor:body.annualRentMinor===undefined?Number(current.annual_rent_minor||0):nonNegative(body.annualRentMinor),
      annualOperatingCostMinor:body.annualOperatingCostMinor===undefined?Number(current.annual_operating_cost_minor||0):nonNegative(body.annualOperatingCostMinor),
      debtBalanceMinor:body.debtBalanceMinor===undefined?Number(current.debt_balance_minor||0):nonNegative(body.debtBalanceMinor),
      status:body.status===undefined?current.status:text(body.status,16)
    };
    if(next.name.length<2||!next.propertyType||!next.tenureType||!["active","archived"].includes(next.status))return json({error:"invalid_property_update"},400);
    if(next.acquisitionDate&&!validDate(next.acquisitionDate))return json({error:"invalid_acquisition_date"},400);
    if((body.acquisitionCostMinor!==undefined&&body.acquisitionCostMinor!==null&&next.acquisitionCostMinor===null)||next.annualRentMinor===null||next.annualOperatingCostMinor===null||next.debtBalanceMinor===null)
      return json({error:"invalid_property_amount"},400);
    try{
      await env.DB.prepare(
        "UPDATE property_assets SET name=?,property_type=?,location_text=?,tenure_type=?,acquisition_date=?,acquisition_cost_minor=?,annual_rent_minor=?,annual_operating_cost_minor=?,debt_balance_minor=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=?"
      ).bind(next.name,next.propertyType,next.location,next.tenureType,next.acquisitionDate,next.acquisitionCostMinor,next.annualRentMinor,next.annualOperatingCostMinor,next.debtBalanceMinor,next.status,auth.tenant_id,asset.assetId).run();
    }catch{return json({error:"property_asset_update_failed"},503)}
    await writeAudit(env,auth.tenant_id,auth.user_id,"PROPERTY_ASSET_UPDATED",{propertyId:asset.assetId,status:next.status});
    return json({ok:true,id:asset.assetId,...next});
  }

  const valuations=valuationsRoute(path);
  if(valuations&&request.method==="GET"){
    const rows=await env.DB.prepare(
      "SELECT id,valuation_date,market_value_minor,currency,valuer_name,valuer_registration_ref,report_reference,methodology_note,source_kind,created_at "+
      "FROM property_professional_valuations WHERE tenant_id=? AND property_id=? ORDER BY valuation_date DESC,created_at DESC LIMIT 50"
    ).bind(auth.tenant_id,valuations.assetId).all();
    return json({items:rows.results||[],authority:{professionalValuesOnlyFromRecordedExternalReports:true,thebeMarketValuation:false,thebeCertification:false,professionalCredentialVerifiedByThebe:false}});
  }

  if(valuations&&request.method==="POST"){
    if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
    const body=await readJson(request,{maxBytes:16*1024}),valuationDate=text(body.valuationDate,10),
      marketValueMinor=integer(body.marketValueMinor),valuerName=text(body.valuerName,160),
      valuerRegistrationRef=text(body.valuerRegistrationRef,120),reportReference=text(body.reportReference,160),
      methodologyNote=text(body.methodologyNote,500),currency=activeCurrency();
    if(!validDate(valuationDate))return json({error:"invalid_valuation_date"},400);
    if(marketValueMinor===null||marketValueMinor<=0)return json({error:"invalid_market_value"},400);
    if(valuerName.length<2||valuerRegistrationRef.length<2||reportReference.length<2)return json({error:"professional_report_details_required"},400);
    const property=await env.DB.prepare("SELECT id,currency,status FROM property_assets WHERE tenant_id=? AND id=? LIMIT 1").bind(auth.tenant_id,valuations.assetId).first();
    if(!property||property.status!=="active")return json({error:"property_asset_not_found"},404);
    if(String(property.currency)!==currency)return json({error:"property_currency_mismatch"},409);
    const valuationId=id();
    try{
      await env.DB.prepare(
        "INSERT INTO property_professional_valuations(id,tenant_id,property_id,valuation_date,market_value_minor,currency,valuer_name,valuer_registration_ref,report_reference,methodology_note,source_kind,created_by_user_id) "+
        "VALUES(?,?,?,?,?,?,?,?,?,?,'external_professional_report',?)"
      ).bind(valuationId,auth.tenant_id,valuations.assetId,valuationDate,marketValueMinor,currency,valuerName,valuerRegistrationRef,reportReference,methodologyNote,auth.user_id).run();
    }catch(error){
      if(String(error).includes("property_valuation_currency_mismatch"))return json({error:"property_currency_mismatch"},409);
      return json({error:"professional_valuation_record_failed"},503);
    }
    await writeAudit(env,auth.tenant_id,auth.user_id,"PROPERTY_PROFESSIONAL_VALUATION_RECORDED",{
      propertyId:valuations.assetId,valuationId,valuationDate,marketValueMinor,currency,reportReference,valuerRegistrationRef,
      sourceKind:"external_professional_report",thebeCertified:false,professionalCredentialVerifiedByThebe:false
    });
    return json({ok:true,id:valuationId,propertyId:valuations.assetId,valuationDate,marketValueMinor,currency,sourceKind:"external_professional_report",thebeCertified:false},201);
  }

  return json({error:"not_found"},404);
}

export const __propertyPortfolioTest=frozen({validDate,normalizedType,normalizedTenure,derivePortfolioMetrics});
