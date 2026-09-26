import {evaluateToolTrust} from "./agent-tool-trust-registry.js";
import {planSuperAgentWork} from "./super-agent-planner.js";
import {FINANCE_WATCH_READ_ACTIONS} from "./finance-watch-contract.js";
export const PERSISTENT_FINANCE_OBSERVER_VERSION="2026-09-25.v1";
const READS=FINANCE_WATCH_READ_ACTIONS;
export function buildFinanceObservationRun({task,observation={}}={}){
  const allowed=new Set(Array.isArray(task?.allowedTools)?task.allowedTools:[]);
  const reads=READS.filter(actionKey=>allowed.has(actionKey)&&evaluateToolTrust({actionKey}).allowed);
  const plan=planSuperAgentWork({goal:task?.objective||"Observe finance state.",observation,persistentTask:{...task,allowedTools:reads}});
  return Object.freeze({version:PERSISTENT_FINANCE_OBSERVER_VERSION,taskId:String(task?.id||""),mode:"read_only",reads:Object.freeze(reads),plan,executionAllowed:false,externalActions:0,checkpointRequired:true});
}
export const __persistentFinanceObserverTest=Object.freeze({READS});