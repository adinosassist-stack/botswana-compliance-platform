const DEFAULT_MAX_BYTES=24*1024;
const encoder=new TextEncoder();

const clean=(value,max=180)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const bytes=value=>encoder.encode(typeof value==="string"?value:JSON.stringify(value)).byteLength;
const plain=value=>value&&typeof value==="object"&&!Array.isArray(value);

function bounded(value,{depth=3,arrayLimit=6,keyLimit=24,stringLimit=180}={},level=0){
  if(value==null||typeof value==="number"||typeof value==="boolean")return value;
  if(typeof value==="string")return clean(value,stringLimit);
  if(Array.isArray(value)){
    if(level>=depth)return [];
    return value.slice(0,arrayLimit).map(item=>bounded(item,{depth,arrayLimit,keyLimit,stringLimit},level+1));
  }
  if(!plain(value))return null;
  if(level>=depth){
    const out={};
    for(const key of Object.keys(value).sort().slice(0,keyLimit)){
      const item=value[key];
      if(item==null||typeof item==="number"||typeof item==="boolean")out[key]=item;
      else if(typeof item==="string")out[key]=clean(item,stringLimit);
    }
    return out;
  }
  const out={};
  for(const key of Object.keys(value).sort().slice(0,keyLimit))out[key]=bounded(value[key],{depth,arrayLimit,keyLimit,stringLimit},level+1);
  return out;
}

function compactSource(x,{dropUrl=false,stringLimit=160}={}){
  if(!x)return null;
  return {
    ref:x.ref,
    authority:clean(x.authority,stringLimit),
    title:clean(x.title,stringLimit),
    ...(dropUrl?{}:{url:clean(x.url,180)}),
    effectiveDate:x.effectiveDate||null,
    verificationStatus:clean(x.verificationStatus,40)||"unknown"
  };
}

function compactFinance(finance,{receivables=4}={}){
  if(!finance)return null;
  return {...finance,topReceivables:(finance.topReceivables||[]).slice(0,receivables).map(row=>({...row,customerName:clean(row?.customerName,100)}))};
}

function compactProperty(property,{items=4,nested={}}={}){
  if(!property)return null;
  return {
    ref:property.ref,
    available:property.available!==false,
    restricted:property.restricted===true,
    metrics:bounded(property.metrics,nested),
    items:(property.items||[]).slice(0,items).map(row=>({
      name:clean(row?.name,100),type:clean(row?.type,40),status:clean(row?.status,40),location:clean(row?.location,100),
      latestProfessionalValuation:row?.latestProfessionalValuation?bounded(row.latestProfessionalValuation,{...nested,depth:2}):null
    }))
  };
}

function compactBusinessMemory(memory,nested){
  if(!memory)return null;
  return {
    ref:memory.ref,
    businessDate:memory.businessDate||null,
    market:bounded(memory.market,{...nested,depth:2}),
    identity:bounded(memory.identity,{...nested,depth:2}),
    ownerEnteredMemory:bounded(memory.ownerEnteredMemory,nested),
    language:bounded(memory.language,{...nested,depth:2}),
    sales:bounded(memory.sales,nested),
    analytics:bounded(memory.analytics,nested),
    spendEnvelope:bounded(memory.spendEnvelope,{...nested,depth:3}),
    proposedSpendScenario:bounded(memory.proposedSpendScenario,{...nested,depth:3}),
    positiveInflowTodayMinor:Number(memory.positiveInflowTodayMinor||0),
    customerCollectionsTodayMinor:Number(memory.customerCollectionsTodayMinor||0),
    provenanceRule:clean(memory.provenanceRule,240)
  };
}

function projected(context,spec){
  const nested={depth:spec.depth,arrayLimit:spec.nestedArrayLimit,keyLimit:spec.keyLimit,stringLimit:spec.stringLimit};
  const base={
    ...context,
    contextAvailability:{...(context?.contextAvailability||{}),contextCompaction:"compacted",contextComplete:false},
    profile:bounded(context?.profile,{...nested,depth:2}),
    market:bounded(context?.market,{...nested,depth:2}),
    language:bounded(context?.language,{...nested,depth:2}),
    protection:context?.protection?{
      ref:context.protection.ref,score:context.protection.score,grade:context.protection.grade,
      dimensions:bounded(context.protection.dimensions,nested),capturedAt:context.protection.capturedAt||null
    }:null,
    finance:compactFinance(context?.finance,{receivables:spec.receivables}),
    propertyContext:compactProperty(context?.propertyContext,{items:spec.propertyItems,nested}),
    businessMemory:compactBusinessMemory(context?.businessMemory,nested),
    obligations:(context?.obligations||[]).slice(0,spec.obligations).map(row=>({...row,title:clean(row?.title,spec.stringLimit),ruleRef:clean(row?.ruleRef,100),sourceRefs:(row?.sourceRefs||[]).slice(0,8)})),
    risks:(context?.risks||[]).slice(0,spec.risks).map(row=>({...row,title:clean(row?.title,spec.stringLimit),recommendedAction:clean(row?.recommendedAction,Math.min(220,spec.stringLimit+60))})),
    controls:(context?.controls||[]).slice(0,spec.controls).map(row=>({...row,name:clean(row?.name,spec.stringLimit)})),
    tenders:(context?.tenders||[]).slice(0,spec.tenders).map(row=>({...row,title:clean(row?.title,spec.stringLimit),issuer:clean(row?.issuer,100)})),
    cipa:bounded(context?.cipa,{...nested,depth:2}),
    operations:bounded(context?.operations,{...nested,depth:2}),
    sources:(context?.sources||[]).slice(0,spec.sources).map(row=>compactSource(row,{dropUrl:spec.dropSourceUrls,stringLimit:spec.stringLimit})).filter(Boolean)
  };
  return base;
}

function essential(context){
  const nested={depth:2,arrayLimit:2,keyLimit:12,stringLimit:110};
  return {
    contextAvailability:{...(context?.contextAvailability||{}),contextCompaction:"compacted",contextComplete:false},
    profile:bounded(context?.profile,{...nested,depth:2}),workspaceVersion:Number(context?.workspaceVersion||0),
    market:bounded(context?.market,{...nested,depth:2}),language:bounded(context?.language,{...nested,depth:2}),
    protection:context?.protection?{ref:context.protection.ref,score:context.protection.score,grade:context.protection.grade,capturedAt:context.protection.capturedAt||null}:null,
    finance:context?.finance?{...compactFinance(context.finance,{receivables:0}),topReceivables:[]}:null,
    propertyContext:context?.propertyContext?{ref:context.propertyContext.ref,available:context.propertyContext.available!==false,restricted:context.propertyContext.restricted===true,metrics:bounded(context.propertyContext.metrics,nested),items:[]}:null,
    businessMemory:context?.businessMemory?{
      ref:context.businessMemory.ref,businessDate:context.businessMemory.businessDate||null,
      identity:bounded(context.businessMemory.identity,nested),ownerEnteredMemory:bounded(context.businessMemory.ownerEnteredMemory,nested),
      sales:bounded(context.businessMemory.sales,nested),analytics:bounded(context.businessMemory.analytics,nested),
      spendEnvelope:bounded(context.businessMemory.spendEnvelope,nested),proposedSpendScenario:bounded(context.businessMemory.proposedSpendScenario,nested),
      positiveInflowTodayMinor:Number(context.businessMemory.positiveInflowTodayMinor||0),customerCollectionsTodayMinor:Number(context.businessMemory.customerCollectionsTodayMinor||0),
      provenanceRule:clean(context.businessMemory.provenanceRule,180)
    }:null,
    obligations:(context?.obligations||[]).slice(0,4).map(row=>({ref:row.ref,title:clean(row.title,110),status:row.status,priority:row.priority,dueAt:row.dueAt||null,sourceRefs:(row.sourceRefs||[]).slice(0,4)})),
    risks:(context?.risks||[]).slice(0,3).map(row=>({ref:row.ref,title:clean(row.title,110),severity:row.severity,status:row.status,dueAt:row.dueAt||null,recommendedAction:clean(row.recommendedAction,130)})),
    controls:(context?.controls||[]).slice(0,3).map(row=>({ref:row.ref,name:clean(row.name,110),status:row.status,evidenceHealth:row.evidenceHealth,dueAt:row.dueAt||null})),
    tenders:(context?.tenders||[]).slice(0,2).map(row=>({ref:row.ref,title:clean(row.title,110),status:row.status,closingAt:row.closingAt||null,missingRequired:row.missingRequired,mandatoryCount:row.mandatoryCount})),
    cipa:bounded(context?.cipa,nested),operations:bounded(context?.operations,nested),
    sources:(context?.sources||[]).slice(0,4).map(row=>compactSource(row,{dropUrl:true,stringLimit:100})).filter(Boolean)
  };
}

export function collectAiAdvisorContextRefs(value,out=new Set()){
  if(Array.isArray(value)){for(const item of value)collectAiAdvisorContextRefs(item,out);return out}
  if(!plain(value))return out;
  if(typeof value.ref==="string"&&value.ref.trim())out.add(value.ref.trim());
  if(Array.isArray(value.sourceRefs))for(const ref of value.sourceRefs){if(typeof ref==="string"&&ref.trim())out.add(ref.trim())}
  for(const item of Object.values(value))collectAiAdvisorContextRefs(item,out);
  return out;
}

function omittedCounts(original,final){
  const keys=["obligations","risks","controls","tenders","sources"];
  const out={};
  for(const key of keys)out[key]=Math.max(0,(original?.[key]?.length||0)-(final?.[key]?.length||0));
  out.receivables=Math.max(0,(original?.finance?.topReceivables?.length||0)-(final?.finance?.topReceivables?.length||0));
  out.properties=Math.max(0,(original?.propertyContext?.items?.length||0)-(final?.propertyContext?.items?.length||0));
  return out;
}

export function compactAiAdvisorContext(context,{maxBytes=DEFAULT_MAX_BYTES}={}){
  const originalSerialized=JSON.stringify(context||{}),originalBytes=bytes(originalSerialized);
  if(originalBytes<=maxBytes)return Object.freeze({
    context,serialized:originalSerialized,bytes:originalBytes,originalBytes,
    compaction:Object.freeze({applied:false,stage:"full",maxBytes,omittedCounts:Object.freeze({})})
  });
  const stages=[
    ["bounded",{depth:3,nestedArrayLimit:5,keyLimit:24,stringLimit:160,receivables:5,propertyItems:5,obligations:12,risks:10,controls:10,tenders:8,sources:16,dropSourceUrls:false}],
    ["reduced",{depth:3,nestedArrayLimit:3,keyLimit:18,stringLimit:130,receivables:3,propertyItems:3,obligations:8,risks:6,controls:6,tenders:5,sources:10,dropSourceUrls:true}],
    ["minimal",{depth:2,nestedArrayLimit:2,keyLimit:12,stringLimit:100,receivables:2,propertyItems:2,obligations:6,risks:4,controls:4,tenders:3,sources:6,dropSourceUrls:true}]
  ];
  for(const [stage,spec] of stages){
    const candidate=projected(context,spec),serialized=JSON.stringify(candidate),finalBytes=bytes(serialized);
    if(finalBytes<=maxBytes)return Object.freeze({
      context:candidate,serialized,bytes:finalBytes,originalBytes,
      compaction:Object.freeze({applied:true,stage,maxBytes,omittedCounts:Object.freeze(omittedCounts(context,candidate))})
    });
  }
  let candidate=essential(context),serialized=JSON.stringify(candidate),finalBytes=bytes(serialized),stage="essential";
  if(finalBytes>maxBytes){
    stage="refs_only";
    candidate={
      contextAvailability:{...(context?.contextAvailability||{}),contextCompaction:"compacted",contextComplete:false},
      profile:bounded(context?.profile,{depth:1,arrayLimit:1,keyLimit:8,stringLimit:80}),
      workspaceVersion:Number(context?.workspaceVersion||0),market:bounded(context?.market,{depth:1,arrayLimit:1,keyLimit:8,stringLimit:80}),
      language:bounded(context?.language,{depth:1,arrayLimit:1,keyLimit:8,stringLimit:80}),
      protection:context?.protection?{ref:context.protection.ref,score:context.protection.score,grade:context.protection.grade,capturedAt:context.protection.capturedAt||null}:null,
      finance:context?.finance?{ref:context.finance.ref,currency:context.finance.currency,cashPositionMinor:context.finance.cashPositionMinor,lastImportAt:context.finance.lastImportAt||null,unresolvedReconciliations:context.finance.unresolvedReconciliations,unresolvedExposureMinor:context.finance.unresolvedExposureMinor,outstandingMinor:context.finance.outstandingMinor,overdueMinor:context.finance.overdueMinor}:null,
      propertyContext:context?.propertyContext?{ref:context.propertyContext.ref,available:context.propertyContext.available!==false,restricted:context.propertyContext.restricted===true}:null,
      businessMemory:context?.businessMemory?{ref:context.businessMemory.ref,businessDate:context.businessMemory.businessDate||null,provenanceRule:clean(context.businessMemory.provenanceRule,120)}:null,
      obligations:(context?.obligations||[]).slice(0,3).map(row=>({ref:row.ref,title:clean(row.title,80),status:row.status,dueAt:row.dueAt||null,sourceRefs:(row.sourceRefs||[]).slice(0,3)})),
      risks:(context?.risks||[]).slice(0,2).map(row=>({ref:row.ref,title:clean(row.title,80),severity:row.severity,status:row.status,dueAt:row.dueAt||null})),
      controls:(context?.controls||[]).slice(0,2).map(row=>({ref:row.ref,name:clean(row.name,80),status:row.status,evidenceHealth:row.evidenceHealth})),
      tenders:(context?.tenders||[]).slice(0,2).map(row=>({ref:row.ref,title:clean(row.title,80),status:row.status,closingAt:row.closingAt||null})),
      cipa:bounded(context?.cipa,{depth:1,arrayLimit:1,keyLimit:8,stringLimit:80}),operations:bounded(context?.operations,{depth:1,arrayLimit:1,keyLimit:8,stringLimit:80}),
      sources:(context?.sources||[]).slice(0,3).map(row=>compactSource(row,{dropUrl:true,stringLimit:80})).filter(Boolean)
    };
    serialized=JSON.stringify(candidate);finalBytes=bytes(serialized);
  }
  return Object.freeze({
    context:candidate,serialized,bytes:finalBytes,originalBytes,
    compaction:Object.freeze({applied:true,stage,maxBytes,omittedCounts:Object.freeze(omittedCounts(context,candidate))})
  });
}

export const AI_ADVISOR_CONTEXT_MAX_BYTES=DEFAULT_MAX_BYTES;
