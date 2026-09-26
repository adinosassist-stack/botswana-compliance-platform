import {evaluateToolTrust} from "./agent-tool-trust-registry.js";
import {planSuperAgentWork} from "./super-agent-planner.js";
export const PERSISTENT_FINANCE_OBSERVER_VERSION="2026-09-25.v1";
const READS=Object.freeze(["financial_position.read","finance_data_quality.read","finance_daily_inflows.read","receivables_summary.read"]);
export function buildFinanceObservationRun({task,observation={}}={}){
  const allowed=new Set(Array.isArray(task?.allowedTools)?task.allowedTools:[]);
  const reads=READS.filter(actionKey=>allowed.has(actionKey)&&evaluateToolTrust({actionKey}).allowed);
  const plan=planSuperAgentWork({goal:task?.objective||"Observe finance state.",observation,persistentTask:{...task,allowedTools:reads}});
  return Object.freeze({version:PERSISTENT_FINANCE_OBSERVER_VERSION,taskId:String(task?.id||""),mode:"read_only",reads:Object.freeze(reads),plan,executionAllowed:false,externalActions:0,checkpointRequired:true});
}
export const __persistentFinanceObserverTest=Object.freeze({READS});