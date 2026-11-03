// In-memory development-only adapter; deliberately not wired to production HTTP routes.
// Real deployments require transactional persistence and durable append-only audit storage.
import {admitWorkflow,transitionWorkflow} from "./workflow-contract.mjs";
import {buildAgentCommandCentre} from "./command-centre-readonly.mjs";
export function createDevelopmentWorkflowStore({enabled=false}={}){
 const workflows=new Map(), events=[];
 const requireEnabled=()=>{if(enabled!==true)throw new Error("AGENT_WORKFLOWS_DISABLED");};
 return Object.freeze({
  create(input){
   requireEnabled();
   const item=admitWorkflow({...input,enabled});
   const key=JSON.stringify([item.tenantId,item.id]);
   if(workflows.has(key))throw new Error("DUPLICATE_WORKFLOW");
   workflows.set(key,item);
   events.push(Object.freeze({tenantId:item.tenantId,workflowId:item.id,actorId:input.actor.id,from:null,to:"draft",version:0}));
   return item;
  },
  transition({tenantId,id,actor,to,expectedVersion,proposalDigest}){
   requireEnabled();
   if(!actor?.id||actor.tenantId!==tenantId)throw new Error("WORKFLOW_FORBIDDEN");
   const key=JSON.stringify([tenantId,id]),previous=workflows.get(key);
   if(!previous)throw new Error("WORKFLOW_NOT_FOUND");
   const next=transitionWorkflow(previous,{enabled,actor,to,expectedVersion,proposalDigest});
   workflows.set(key,next);
   events.push(Object.freeze({tenantId,workflowId:id,actorId:actor.id,from:previous.state,to,version:next.version}));
   return next;
  },
  summary({tenantId,actor}){
   requireEnabled();
   return buildAgentCommandCentre({tenantId,actor,workflows:[...workflows.values()]});
  },
  audit({tenantId,actor}){
   requireEnabled();
   if(!actor?.id||actor.tenantId!==tenantId||!actor.canViewWorkflows)throw new Error("WORKFLOW_FORBIDDEN");
   return events.filter(e=>e.tenantId===tenantId).map(e=>({...e}));
  }
 });
}
