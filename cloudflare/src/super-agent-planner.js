import {buildSingleAgentOrchestration} from "./agent-orchestration.js";
import {evaluateToolTrust} from "./agent-tool-trust-registry.js";

export const SUPER_AGENT_PLANNER_VERSION="2026-09-25.v1";

const FINANCE_WATCH_TOOLS=Object.freeze([
  "financial_position.read",
  "finance_data_quality.read",
  "finance_daily_inflows.read",
  "receivables_summary.read"
]);

function frozen(value){return Object.freeze(value)}
function clean(value,max=500){return String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max)}

export function planSuperAgentWork({goal="",observation={},persistentTask=null}={}){
  const orchestration=buildSingleAgentOrchestration({goal,observation});
  const requested=Array.isArray(persistentTask?.allowedTools)?persistentTask.allowedTools:[];
  const toolPlan=[];
  for(const actionKey of requested){
    const trust=evaluateToolTrust({actionKey});
    if(!trust.allowed)continue;
    toolPlan.push(frozen({
      actionKey:trust.tool.actionKey,
      toolId:trust.tool.toolId,
      transport:trust.tool.transport,
      mode:"observe",
      executionAllowed:false,
      externalSideEffect:false
    }));
  }
  return frozen({
    version:SUPER_AGENT_PLANNER_VERSION,
    agentKey:"thebe",
    architecture:"single_agent",
    goal:clean(goal),
    persistentTaskId:clean(persistentTask?.id,120)||null,
    orchestration,
    toolPlan:frozen(toolPlan),
    authority:"none",
    executionAllowed:false,
    checkpointRequired:true,
    verificationRequired:true
  });
}

export function buildReadOnlyFinanceWatchTask({objective="Watch finance certainty and surface material exceptions.",nextRunAt=null}={}){
  return frozen({
    objective:clean(objective),
    triggerKind:"scheduled",
    triggerSpec:frozen({cadence:"daily",timezone:"Africa/Gaborone"}),
    allowedTools:FINANCE_WATCH_TOOLS,
    riskPolicy:frozen({mode:"read_only",sideEffects:false,stopOnBoundarySurprise:true}),
    approvalPolicy:frozen({consequentialActions:"owner_required"}),
    budget:frozen({maxToolCallsPerRun:4,maxExternalActions:0}),
    nextRunAt,
    executionAllowed:false
  });
}

export const __superAgentPlannerTest=frozen({FINANCE_WATCH_TOOLS});
