export const OWNER_ATTENTION_VERSION="2026-10-11.v1";

const VALID_STATES=new Set(["ready","loading","unavailable"]);
const VALID_SEVERITIES=new Set(["critical","urgent","high","warning","medium","low","info","positive"]);
const VALID_TRUTH_STATES=new Set(["verified","recorded","submitted","completed","generated","approved","open","in_progress","review","blocked","unknown","recommendation"]);

const clean=(value,max=240)=>String(value??"")
  .replace(/[\u0000-\u001f\u007f]/g," ")
  .replace(/\s+/g," ")
  .trim()
  .slice(0,max);

const finite=value=>{
  const n=Number(value);
  return Number.isFinite(n)?n:null;
};

const frozen=value=>Object.freeze(value);

function iso(value){
  const raw=clean(value,80);
  if(!raw)return null;
  const stamp=Date.parse(raw);
  return Number.isFinite(stamp)?new Date(stamp).toISOString():null;
}

function isoDate(value){
  const raw=clean(value,20);
  if(!raw)return null;
  const match=raw.match(/^\d{4}-\d{2}-\d{2}$/);
  if(match&&!Number.isNaN(Date.parse(`${raw}T00:00:00Z`)))return raw;
  const stamp=Date.parse(raw);
  return Number.isFinite(stamp)?new Date(stamp).toISOString().slice(0,10):null;
}

function bool(value,fallback=false){
  return value===true?true:value===false?false:fallback;
}

function normalizeAvailabilityEntry(value,{required=false}={}){
  if(value===true)return frozen({available:true,required});
  if(value===false)return frozen({available:false,required});
  if(!value||typeof value!=="object")return frozen({available:null,required});
  const available=value.available===true?true:value.available===false?false:null;
  return frozen({
    available,
    required:bool(value.required,required),
    observedAt:iso(value.observedAt),
    reason:clean(value.reason,180)||null
  });
}

export function normalizeOwnerAttentionAvailability(sourceAvailability={}){
  const source=sourceAvailability&&typeof sourceAvailability==="object"?sourceAvailability:{};
  const defaults={
    dailyBrief:{required:true},
    businessContext:{required:false},
    approvals:{required:true},
    outcomes:{required:true}
  };
  const names=new Set([...Object.keys(defaults),...Object.keys(source)]);
  const out={};
  for(const name of names){
    const key=clean(name,80);
    if(!key)continue;
    out[key]=normalizeAvailabilityEntry(source[name],defaults[name]||{});
  }
  return frozen(out);
}

function sourceAvailable(availability,name){
  const entry=availability?.[name];
  return entry?.available===true;
}

function requiredSourceUnavailable(availability){
  return Object.values(availability||{}).some(entry=>entry?.required===true&&entry.available===false);
}

function requiredSourceUnknown(availability){
  return Object.values(availability||{}).some(entry=>entry?.required===true&&entry.available!==true);
}

function severity(value){
  const raw=clean(value,24).toLowerCase();
  if(VALID_SEVERITIES.has(raw))return raw;
  return "medium";
}

function truthState(value,{authoritative=true}={}){
  if(!authoritative)return "recommendation";
  const raw=clean(value,32).toLowerCase();
  return VALID_TRUTH_STATES.has(raw)?raw:"recorded";
}

function evidenceState(value){
  const raw=clean(value,40).toLowerCase();
  return raw||"unknown";
}

function sourceRefs(value){
  if(!Array.isArray(value))return frozen([]);
  return frozen([...new Set(value.map(item=>clean(item,120)).filter(Boolean))].slice(0,12));
}

function ownerValue(value){
  if(!value)return null;
  if(typeof value==="string")return frozen({label:clean(value,120)||null});
  if(typeof value!=="object")return null;
  const id=clean(value.id||value.userId,120)||null;
  const label=clean(value.label||value.name||value.displayName,120)||null;
  return id||label?frozen({id,label}):null;
}

function canonicalItem({
  sourceType,
  sourceId,
  category="action",
  title,
  owner=null,
  dueAt=null,
  severity:severityValue="medium",
  truthState:truthValue="recorded",
  evidenceState:evidenceValue="unknown",
  refs=[],
  recommendation=null,
  actionRoute=null,
  updatedAt=null,
  authoritative=true,
  status=null,
  detail=null
}={}){
  const cleanSourceType=clean(sourceType,80);
  const cleanSourceId=clean(sourceId,160);
  const cleanTitle=clean(title,220);
  if(!cleanSourceType||!cleanSourceId||!cleanTitle)return null;
  const due=iso(dueAt);
  const updated=iso(updatedAt);
  return frozen({
    key:`${cleanSourceType}:${cleanSourceId}`,
    sourceType:cleanSourceType,
    sourceId:cleanSourceId,
    category:clean(category,40)||"action",
    title:cleanTitle,
    owner:ownerValue(owner),
    dueAt:due,
    severity:severity(severityValue),
    truthState:truthState(truthValue,{authoritative}),
    evidenceState:evidenceState(evidenceValue),
    sourceRefs:sourceRefs(refs),
    recommendedAction:clean(recommendation,320)||null,
    actionRoute:clean(actionRoute,180)||null,
    updatedAt:updated,
    authoritative:authoritative===true,
    status:clean(status,60)||null,
    detail:clean(detail,500)||null
  });
}

function dailyActionItems(dailyBrief){
  const rows=Array.isArray(dailyBrief?.topActions)?dailyBrief.topActions:[];
  return rows.map((row,index)=>canonicalItem({
    sourceType:row?.source||row?.sourceType||row?.kind||"daily_brief",
    sourceId:row?.id||row?.sourceId||row?.key||`action-${index+1}`,
    category:"action",
    title:row?.title||row?.label||"Business action",
    owner:row?.owner||row?.assignedOwner||null,
    dueAt:row?.dueAt||row?.due_at||null,
    severity:row?.severity||(Number(row?.priority)===1?"high":"medium"),
    truthState:row?.truthState||row?.status||"recorded",
    evidenceState:row?.evidenceState||row?.evidenceHealth||"unknown",
    refs:row?.sourceRefs||row?.evidenceRefs||[],
    recommendation:row?.recommendedAction||row?.recommendation||row?.action||null,
    actionRoute:row?.actionRoute||row?.target||null,
    updatedAt:row?.updatedAt||row?.updated_at||row?.createdAt||row?.created_at||null,
    authoritative:true,
    status:row?.status||null,
    detail:row?.detail||row?.reason||null
  })).filter(Boolean);
}

function deterministicRecommendations(businessBrief){
  const rows=Array.isArray(businessBrief?.priorities)?businessBrief.priorities:[];
  return rows.map((row,index)=>canonicalItem({
    sourceType:"business_priority",
    sourceId:row?.key||row?.id||`priority-${index+1}`,
    category:"recommendation",
    title:row?.title||"Thebe recommendation",
    dueAt:row?.dueAt||null,
    severity:row?.severity||"medium",
    truthState:"recommendation",
    evidenceState:Array.isArray(row?.sourceRefs)&&row.sourceRefs.length?"referenced":"unknown",
    refs:row?.sourceRefs||[],
    recommendation:row?.detail||row?.recommendation||null,
    actionRoute:row?.actionKey||row?.actionRoute||null,
    updatedAt:businessBrief?.observedAt||null,
    authoritative:false,
    status:"recommendation",
    detail:row?.detail||null
  })).filter(Boolean);
}

function approvalItems(approvals){
  const rows=Array.isArray(approvals)?approvals:[];
  return rows.map((row,index)=>canonicalItem({
    sourceType:row?.sourceType||row?.type||"approval",
    sourceId:row?.sourceId||row?.id||`approval-${index+1}`,
    category:"approval",
    title:row?.title||row?.label||"Approval required",
    owner:row?.owner||row?.reviewer||null,
    dueAt:row?.dueAt||row?.due_at||null,
    severity:row?.severity||"medium",
    truthState:row?.truthState||row?.status||"review",
    evidenceState:row?.evidenceState||row?.evidenceHealth||"unknown",
    refs:row?.sourceRefs||row?.evidenceRefs||[],
    recommendation:row?.recommendedAction||row?.recommendation||"Review the supporting record before deciding.",
    actionRoute:row?.actionRoute||row?.target||null,
    updatedAt:row?.updatedAt||row?.updated_at||row?.createdAt||row?.created_at||null,
    authoritative:true,
    status:row?.status||null,
    detail:row?.detail||row?.reason||null
  })).filter(Boolean);
}

function outcomeItems(outcomes){
  const rows=Array.isArray(outcomes)?outcomes:[];
  return rows.map((row,index)=>canonicalItem({
    sourceType:row?.sourceType||row?.type||"outcome",
    sourceId:row?.sourceId||row?.id||`outcome-${index+1}`,
    category:"outcome",
    title:row?.title||row?.label||"Outcome pending",
    owner:row?.owner||null,
    dueAt:row?.dueAt||row?.due_at||null,
    severity:row?.severity||"medium",
    truthState:row?.truthState||row?.status||"review",
    evidenceState:row?.evidenceState||row?.evidenceHealth||"unknown",
    refs:row?.sourceRefs||row?.evidenceRefs||[],
    recommendation:row?.recommendedAction||row?.recommendation||"Record the verified outcome when evidence is available.",
    actionRoute:row?.actionRoute||row?.target||null,
    updatedAt:row?.updatedAt||row?.updated_at||row?.createdAt||row?.created_at||null,
    authoritative:true,
    status:row?.status||null,
    detail:row?.detail||row?.reason||null
  })).filter(Boolean);
}

const severityRank=Object.freeze({critical:0,urgent:1,high:2,warning:3,medium:4,low:5,info:6,positive:7});

function sortItems(items){
  return [...items].sort((a,b)=>{
    const severityDelta=(severityRank[a.severity]??9)-(severityRank[b.severity]??9);
    if(severityDelta)return severityDelta;
    const aDue=a.dueAt?Date.parse(a.dueAt):Infinity;
    const bDue=b.dueAt?Date.parse(b.dueAt):Infinity;
    if(aDue!==bDue)return aDue-bDue;
    return a.key.localeCompare(b.key);
  });
}

function countIfAvailable(availability,name,items,category){
  if(!sourceAvailable(availability,name))return null;
  return items.filter(item=>item.category===category).length;
}

function urgentCount(items){
  return items.filter(item=>item.authoritative&&["critical","urgent","high"].includes(item.severity)).length;
}

function overdueCount(items,now){
  const nowMs=now instanceof Date?now.getTime():Date.parse(now);
  if(!Number.isFinite(nowMs))return null;
  return items.filter(item=>item.authoritative&&item.dueAt&&Date.parse(item.dueAt)<nowMs&&!(["completed","approved"].includes(item.truthState))).length;
}

export function buildOwnerAttentionProjection({
  requestedState="ready",
  generatedAt=new Date().toISOString(),
  businessDate=null,
  market=null,
  businessBrief=null,
  dailyBrief=null,
  approvals=[],
  outcomes=[],
  sourceAvailability={},
  now=new Date()
}={}){
  const availability=normalizeOwnerAttentionAvailability(sourceAvailability);
  const explicitState=VALID_STATES.has(requestedState)?requestedState:"ready";
  const unavailable=requiredSourceUnavailable(availability);
  const unknown=requiredSourceUnknown(availability);
  const state=explicitState==="loading"?"loading":unavailable||unknown?"unavailable":explicitState;

  const actions=sourceAvailable(availability,"dailyBrief")?dailyActionItems(dailyBrief):[];
  const recommendations=sourceAvailable(availability,"businessContext")?deterministicRecommendations(businessBrief):[];
  const approvalRows=sourceAvailable(availability,"approvals")?approvalItems(approvals):[];
  const outcomeRows=sourceAvailable(availability,"outcomes")?outcomeItems(outcomes):[];
  const items=sortItems([...actions,...approvalRows,...outcomeRows,...recommendations]);

  const actionCount=countIfAvailable(availability,"dailyBrief",items,"action");
  const approvalCount=countIfAvailable(availability,"approvals",items,"approval");
  const outcomeCount=countIfAvailable(availability,"outcomes",items,"outcome");
  const recommendationCount=sourceAvailable(availability,"businessContext")?items.filter(item=>item.category==="recommendation").length:null;
  const authoritativeCounts=[actionCount,approvalCount,outcomeCount];
  const total=authoritativeCounts.every(value=>value!==null)?authoritativeCounts.reduce((sum,value)=>sum+value,0):null;
  const authoritativeCoverage=authoritativeCounts.every(value=>value!==null);

  return frozen({
    version:OWNER_ATTENTION_VERSION,
    state,
    generatedAt:iso(generatedAt)||new Date().toISOString(),
    businessDate:isoDate(businessDate),
    market:market&&typeof market==="object"?frozen({
      code:clean(market.code,24)||null,
      country:clean(market.country,80)||null,
      jurisdiction:clean(market.jurisdiction||market.country,80)||null,
      currency:clean(market.currency,16)||null,
      timeZone:clean(market.timeZone,80)||null
    }):null,
    counts:frozen({
      action:actionCount,
      approvals:approvalCount,
      outcomes:outcomeCount,
      recommendations:recommendationCount,
      total,
      urgent:authoritativeCoverage?urgentCount(items):null,
      overdue:authoritativeCoverage?overdueCount(items,now):null
    }),
    items:frozen(items),
    sourceAvailability:availability,
    provenance:frozen({
      authoritativeItemCategories:frozen(["action","approval","outcome"]),
      recommendationCategory:"recommendation",
      rule:"Domain records remain authoritative. Missing or failed source reads remain unavailable and are never converted into reassuring zero counts. Deterministic recommendations are labelled non-authoritative and cannot create approval or execution authority."
    })
  });
}

export const __ownerAttentionTest=frozen({
  canonicalItem,
  dailyActionItems,
  deterministicRecommendations,
  approvalItems,
  outcomeItems,
  sourceAvailable,
  requiredSourceUnavailable,
  requiredSourceUnknown,
  sortItems,
  overdueCount,
  finite
});
