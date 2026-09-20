export const AGENT_CONTINUATION_VERSION="2026-09-20.single-agent-v3";

const MAX_GOAL=500;
const MAX_SUMMARY=1800;
const MAX_PROPOSALS=8;
const MAX_WORK_UNITS=6;

function text(value,max=500){return String(value??"").trim().slice(0,max)}
function unique(values=[]){return [...new Set((Array.isArray(values)?values:[]).map(value=>text(value,120)).filter(Boolean))]}

async function sha256Hex(value){
  const bytes=new TextEncoder().encode(String(value??""));
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

function compactObservation(observation={}){
  const finance=observation?.finance||{};
  const operations=observation?.operations||{};
  const compliance=observation?.compliance||{};
  const performance=observation?.performance||{};
  return Object.freeze({
    observedAt:text(observation?.observedAt,80)||null,
    finance:Object.freeze({
      reconciliationExceptions:Number(finance.reconciliationExceptions||0),
      reconciliationExposureMinor:Number(finance.reconciliationExposureMinor||0),
      latestReconciliationAt:text(finance.latestReconciliationAt,80)||null
    }),
    operations:Object.freeze({
      pendingWorkflowCount:Number(operations.pendingWorkflowCount||0),
      failedWorkflowCount:Number(operations.failedWorkflowCount||0),
      latestSummaryDate:text(operations.latestSummaryDate,40)||null
    }),
    compliance:Object.freeze({
      overdueCount:Number(compliance.overdueCount||0),
      dueWithin14Days:Number(compliance.dueWithin14Days||0),
      nextDueAt:text(compliance.nextDueAt,80)||null
    }),
    performance:Object.freeze({
      criticalSignals:Number(performance.criticalSignals||0),
      warningSignals:Number(performance.warningSignals||0)
    })
  });
}

function compactWorkUnits(orchestration={}){
  return Object.freeze((Array.isArray(orchestration?.workUnits)?orchestration.workUnits:[])
    .slice(0,MAX_WORK_UNITS)
    .map(item=>Object.freeze({
      id:text(item?.id,120),
      capability:text(item?.capability,80),
      objective:text(item?.objective,500),
      priority:["low","medium","high"].includes(String(item?.priority))?String(item.priority):"medium",
      sourceRefs:Object.freeze(unique(item?.sourceRefs)),
      state:"context_prepared",
      independentAgentIdentity:false,
      independentMemory:false,
      independentAuthority:false,
      executionAllowed:false,
      externalSideEffects:false
    })));
}

function compactProposals(proposals=[]){
  return Object.freeze((Array.isArray(proposals)?proposals:[])
    .slice(0,MAX_PROPOSALS)
    .map(item=>Object.freeze({
      id:text(item?.id,120)||null,
      ordinal:Number(item?.ordinal||0),
      title:text(item?.title,180),
      priority:["low","medium","high"].includes(String(item?.priority))?String(item.priority):"medium",
      risk:text(item?.risk,40)||"unknown",
      authority:text(item?.authority,80)||"recommendation_only",
      executionPolicy:text(item?.execution_policy||item?.executionPolicy,120)||"not_executable",
      status:text(item?.status,80)||"pending",
      sourceRefs:Object.freeze(unique(item?.sourceRefs)),
      executionAllowed:false
    })));
}

function canonicalCheckpointBody({
  runId,goal,summary,confidence,observation,orchestration,proposals,createdAt,source
}={}){
  const verification=observation?.verification||{};
  return Object.freeze({
    version:AGENT_CONTINUATION_VERSION,
    architecture:"single_agent",
    agentKey:"thebe",
    runId:text(runId,120),
    goal:text(goal,MAX_GOAL),
    summary:text(summary,MAX_SUMMARY),
    confidence:["low","medium","high"].includes(String(confidence))?String(confidence):"medium",
    createdAt:text(createdAt,80)||new Date().toISOString(),
    source:source==="synthesized_from_run"?"synthesized_from_run":"run_checkpoint",
    completedStages:Object.freeze(["observe","decompose","route_capabilities","reason","verify"]),
    nextStage:"fresh_observation_then_recommend",
    observation:compactObservation(observation),
    workUnits:compactWorkUnits(orchestration||observation?.orchestration||{}),
    proposals:compactProposals(proposals),
    verification:Object.freeze({
      total:Number(verification.total||0),
      grounded:Number(verification.grounded||0),
      ungrounded:Number(verification.ungrounded||0),
      allGrounded:verification.allGrounded===true,
      authorityExpanded:false,
      executionAllowed:false
    }),
    evidence:Object.freeze({
      allowedSourceRefs:Object.freeze(unique(orchestration?.allowedSourceRefs||observation?.orchestration?.allowedSourceRefs||[]))
    }),
    authority:Object.freeze({
      inherited:false,
      independentAuthority:false,
      approvalReusable:false,
      executionAllowed:false,
      externalSideEffects:false
    }),
    resumePolicy:Object.freeze({
      freshObservationRequired:true,
      revalidateSourceRefs:true,
      approvalsReusable:false,
      executionAuthorityInherited:false,
      recheckRuntimeGuardBeforeAnyFutureExecution:true
    })
  });
}

export async function buildContinuationCheckpoint(input={}){
  const body=canonicalCheckpointBody(input);
  const digest=await sha256Hex(JSON.stringify(body));
  return Object.freeze({...body,digest});
}

export async function verifyContinuationCheckpoint(checkpoint={}){
  if(!checkpoint||typeof checkpoint!=="object")return Object.freeze({valid:false,code:"checkpoint_invalid"});
  if(checkpoint.version!==AGENT_CONTINUATION_VERSION)return Object.freeze({valid:false,code:"checkpoint_version_mismatch"});
  if(checkpoint.architecture!=="single_agent"||checkpoint.agentKey!=="thebe")return Object.freeze({valid:false,code:"checkpoint_agent_identity_invalid"});
  if(!checkpoint.runId)return Object.freeze({valid:false,code:"checkpoint_run_required"});
  if(checkpoint.authority?.inherited!==false||
    checkpoint.authority?.independentAuthority!==false||
    checkpoint.authority?.approvalReusable!==false||
    checkpoint.authority?.executionAllowed!==false||
    checkpoint.authority?.externalSideEffects!==false){
    return Object.freeze({valid:false,code:"checkpoint_authority_invalid"});
  }
  if(checkpoint.resumePolicy?.freshObservationRequired!==true||
    checkpoint.resumePolicy?.approvalsReusable!==false||
    checkpoint.resumePolicy?.executionAuthorityInherited!==false||
    checkpoint.resumePolicy?.recheckRuntimeGuardBeforeAnyFutureExecution!==true){
    return Object.freeze({valid:false,code:"checkpoint_resume_policy_invalid"});
  }
  const workUnits=Array.isArray(checkpoint.workUnits)?checkpoint.workUnits:[];
  if(workUnits.some(item=>item?.independentAgentIdentity!==false||
    item?.independentMemory!==false||
    item?.independentAuthority!==false||
    item?.executionAllowed!==false||
    item?.externalSideEffects!==false)){
    return Object.freeze({valid:false,code:"checkpoint_work_unit_authority_invalid"});
  }
  const proposals=Array.isArray(checkpoint.proposals)?checkpoint.proposals:[];
  if(proposals.some(item=>item?.executionAllowed!==false))return Object.freeze({valid:false,code:"checkpoint_proposal_execution_invalid"});
  const {digest,...body}=checkpoint;
  if(!/^[a-f0-9]{64}$/.test(String(digest||"")))return Object.freeze({valid:false,code:"checkpoint_digest_invalid"});
  const expected=await sha256Hex(JSON.stringify(body));
  if(expected!==digest)return Object.freeze({valid:false,code:"checkpoint_digest_mismatch"});
  return Object.freeze({valid:true,code:"checkpoint_valid",digest});
}

export function buildResumeContext(checkpoint={}){
  return Object.freeze({
    continuationVersion:text(checkpoint?.version,80),
    parentRunId:text(checkpoint?.runId,120),
    checkpointDigest:text(checkpoint?.digest,80),
    goal:text(checkpoint?.goal,MAX_GOAL),
    priorSummary:text(checkpoint?.summary,1000),
    priorConfidence:["low","medium","high"].includes(String(checkpoint?.confidence))?String(checkpoint.confidence):"medium",
    priorSignals:checkpoint?.observation||{},
    priorWorkUnits:Array.isArray(checkpoint?.workUnits)?checkpoint.workUnits:[],
    priorProposals:Array.isArray(checkpoint?.proposals)?checkpoint.proposals.map(item=>({
      ordinal:item.ordinal,
      title:item.title,
      priority:item.priority,
      risk:item.risk,
      authority:item.authority,
      status:item.status,
      sourceRefs:item.sourceRefs
    })):[],
    freshObservationRequired:true,
    approvalsReusable:false,
    executionAuthorityInherited:false,
    instruction:"Re-observe the workspace before recommending next steps. Treat prior approvals as non-transferable and do not expand authority."
  });
}

export const __agentContinuationTest=Object.freeze({
  compactObservation,
  compactWorkUnits,
  compactProposals,
  canonicalCheckpointBody
});
