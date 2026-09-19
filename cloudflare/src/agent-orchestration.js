export const AGENT_ORCHESTRATION_VERSION="2026-09-20.single-agent-v2";

const CAPABILITY_SOURCE_REFS=Object.freeze({
  core:Object.freeze(["workspace_observation","performance_insights"]),
  finance:Object.freeze(["finance_reconciliation"]),
  compliance:Object.freeze(["compliance_obligations"]),
  operations:Object.freeze(["workflow_jobs"])
});

const MAX_WORK_UNITS=6;
const MAX_PARALLEL_WORK_UNITS=3;

function unique(values=[]){
  return [...new Set((Array.isArray(values)?values:[]).map(value=>String(value||"").trim()).filter(Boolean))];
}

function unit({id,capability,objective,sourceRefs,priority="medium"}){
  return Object.freeze({
    id,
    capability,
    objective,
    priority,
    sourceRefs:Object.freeze(unique(sourceRefs)),
    isolation:"read_only_capability_context",
    authority:"none",
    executionAllowed:false,
    externalSideEffects:false,
    status:"planned"
  });
}

export function buildSingleAgentOrchestration({goal="",observation={}}={}){
  const workUnits=[];
  const finance=observation?.finance||{};
  const operations=observation?.operations||{};
  const compliance=observation?.compliance||{};
  const performance=observation?.performance||{};

  if(Number(finance.reconciliationExceptions||0)>0||!finance.latestReconciliationAt){
    workUnits.push(unit({
      id:"finance-review",
      capability:"finance",
      objective:Number(finance.reconciliationExceptions||0)>0
        ?"Assess recorded reconciliation exceptions and finance certainty."
        :"Assess finance certainty because no reconciliation snapshot is recorded.",
      sourceRefs:["finance_reconciliation"],
      priority:Number(finance.reconciliationExceptions||0)>0?"high":"medium"
    }));
  }

  if(Number(operations.failedWorkflowCount||0)>0||Number(operations.pendingWorkflowCount||0)>0){
    workUnits.push(unit({
      id:"operations-review",
      capability:"operations",
      objective:"Assess failed and pending workflow load using aggregate operating signals.",
      sourceRefs:["workflow_jobs"],
      priority:Number(operations.failedWorkflowCount||0)>0?"high":"medium"
    }));
  }

  if(Number(compliance.overdueCount||0)>0||Number(compliance.dueWithin14Days||0)>0){
    workUnits.push(unit({
      id:"compliance-review",
      capability:"compliance",
      objective:"Assess recorded overdue and near-term compliance obligations.",
      sourceRefs:["compliance_obligations"],
      priority:Number(compliance.overdueCount||0)>0?"high":"medium"
    }));
  }

  if(Number(performance.criticalSignals||0)>0||Number(performance.warningSignals||0)>0){
    workUnits.push(unit({
      id:"performance-review",
      capability:"core",
      objective:"Assess aggregate business-performance signals before recommending follow-up.",
      sourceRefs:["performance_insights"],
      priority:Number(performance.criticalSignals||0)>0?"high":"medium"
    }));
  }

  if(!workUnits.length){
    workUnits.push(unit({
      id:"owner-brief-review",
      capability:"core",
      objective:"Review the current workspace observation and identify the safest useful next action.",
      sourceRefs:["workspace_observation"],
      priority:"low"
    }));
  }

  const bounded=workUnits.slice(0,MAX_WORK_UNITS);
  const allowedSourceRefs=unique([
    "workspace_observation",
    ...bounded.flatMap(item=>item.sourceRefs)
  ]);

  return Object.freeze({
    version:AGENT_ORCHESTRATION_VERSION,
    architecture:"single_agent",
    agentKey:"thebe",
    goal:String(goal||"").trim().slice(0,500),
    loop:Object.freeze(["observe","decompose","route_capabilities","reason","verify","recover_or_recommend"]),
    workUnits:Object.freeze(bounded),
    fanOut:Object.freeze({
      enabled:true,
      type:"capability_work_units",
      maxParallel:MAX_PARALLEL_WORK_UNITS,
      isolated:true,
      independentAgentIdentity:false,
      independentMemory:false,
      independentAuthority:false,
      executionAllowed:false
    }),
    session:Object.freeze({
      durableEventLog:true,
      resumableFromEvents:true,
      eventStore:"agentic_events"
    }),
    allowedSourceRefs:Object.freeze(allowedSourceRefs),
    guarantees:Object.freeze([
      "single_canonical_agent_identity",
      "capability_workers_have_no_authority",
      "tool_authority_remains_deterministic",
      "no_external_side_effects_from_orchestration",
      "verification_does_not_expand_permissions"
    ])
  });
}

export function verifyOrchestratedProposals(proposals=[],orchestration={}){
  const allowed=new Set(unique(orchestration?.allowedSourceRefs));
  const verified=(Array.isArray(proposals)?proposals:[]).map(proposal=>{
    const requestedRefs=unique(proposal?.sourceRefs);
    const sourceRefs=requestedRefs.filter(ref=>allowed.has(ref));
    const dropped=requestedRefs.filter(ref=>!allowed.has(ref));
    const grounded=sourceRefs.length>0;
    const humanOnly=String(proposal?.authority||"")==="human_only"||String(proposal?.risk||"")==="high";
    return {
      ...proposal,
      sourceRefs,
      verification:Object.freeze({
        grounded,
        status:humanOnly?"human_only":grounded?"verified_recommendation":"needs_human_review",
        droppedSourceRefCount:dropped.length,
        authorityExpanded:false,
        executionAllowed:false
      })
    };
  });
  const groundedCount=verified.filter(item=>item.verification.grounded).length;
  return Object.freeze({
    proposals:Object.freeze(verified),
    summary:Object.freeze({
      total:verified.length,
      grounded:groundedCount,
      ungrounded:verified.length-groundedCount,
      allGrounded:verified.length===groundedCount,
      authorityExpanded:false,
      executionAllowed:false,
      orchestrationVersion:String(orchestration?.version||AGENT_ORCHESTRATION_VERSION)
    })
  });
}

export const __agentOrchestrationTest=Object.freeze({
  CAPABILITY_SOURCE_REFS,
  MAX_WORK_UNITS,
  MAX_PARALLEL_WORK_UNITS
});
