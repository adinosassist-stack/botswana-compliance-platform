const PRIORITY_WEIGHT=Object.freeze({high:300,medium:200,low:100});
const MIN_EVIDENCE=3;
const MAX_ASSOCIATION_ADJUSTMENT=10;

function finite(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback}

export function buildOutcomeAssociations(rows=[]){
  const map=Object.create(null);
  for(const row of Array.isArray(rows)?rows:[]){
    const ref=String(row?.source_ref||"").trim().slice(0,120);
    if(!ref)continue;
    const count=Math.max(0,Math.trunc(finite(row?.evidence_count)));
    const positive=Math.max(0,Math.trunc(finite(row?.positive_count)));
    const negative=Math.max(0,Math.trunc(finite(row?.negative_count)));
    const unchanged=Math.max(0,Math.trunc(finite(row?.unchanged_count)));
    map[ref]={
      evidenceCount:count,
      positiveCount:positive,
      negativeCount:negative,
      unchangedCount:unchanged,
      association:count>=MIN_EVIDENCE?Math.max(-1,Math.min(1,(positive-negative)/count)):0,
      causal:false
    };
  }
  return map;
}

export function associationForProposal(proposal,associations={}){
  const refs=[...new Set((Array.isArray(proposal?.sourceRefs)?proposal.sourceRefs:[])
    .map(ref=>String(ref||"").trim()).filter(Boolean))];
  const qualified=refs.map(ref=>associations[ref]).filter(item=>item&&item.evidenceCount>=MIN_EVIDENCE);
  if(!qualified.length)return {evidenceCount:0,association:0,adjustment:0,causal:false};
  const evidenceCount=qualified.reduce((sum,item)=>sum+item.evidenceCount,0);
  const weighted=qualified.reduce((sum,item)=>sum+(item.association*item.evidenceCount),0)/Math.max(1,evidenceCount);
  return {
    evidenceCount,
    association:Math.max(-1,Math.min(1,weighted)),
    adjustment:Math.round(Math.max(-MAX_ASSOCIATION_ADJUSTMENT,Math.min(MAX_ASSOCIATION_ADJUSTMENT,weighted*MAX_ASSOCIATION_ADJUSTMENT))),
    causal:false
  };
}

export function rankOutcomeInformedProposals(proposals=[],associations={}){
  return (Array.isArray(proposals)?proposals:[]).map((proposal,index)=>{
    const learning=associationForProposal(proposal,associations);
    const priority=String(proposal?.priority||"medium");
    const basePriorityWeight=PRIORITY_WEIGHT[priority]??PRIORITY_WEIGHT.medium;
    return {...proposal,outcomeLearning:learning,_rank:basePriorityWeight+learning.adjustment,_original:index};
  }).sort((a,b)=>b._rank-a._rank||a._original-b._original).map((proposal,index)=>{
    const {_rank,_original,...rest}=proposal;
    return {...rest,ordinal:index+1};
  });
}

export const __agenticLearningTest={PRIORITY_WEIGHT,MIN_EVIDENCE,MAX_ASSOCIATION_ADJUSTMENT};
