// Pure server-renderable task view model. No browser injection or live route wiring.
const allowedStates=new Set(["draft","validated","awaiting_approval","approved","executing","completed","failed","cancelled"]);
export function buildAgentDockTasks(summary,{maxItems=20}={}){
 if(!summary||summary.readOnly!==true||!Array.isArray(summary.workflows))throw new Error("INVALID_AGENT_SUMMARY");
 if(!Number.isSafeInteger(maxItems)||maxItems<1||maxItems>100)throw new Error("INVALID_TASK_LIMIT");
 return Object.freeze(summary.workflows.slice(0,maxItems).map(item=>{
  if(!allowedStates.has(item.state)||typeof item.id!=="string"||!Number.isSafeInteger(item.version))throw new Error("INVALID_AGENT_TASK");
  return Object.freeze({
   id:item.id, title:String(item.objective||"").slice(0,200),
   status:item.state, version:item.version,
   approvalRequired:item.requiresApproval===true,
   approvalEnabled:false, executionEnabled:false,
   actions:["view_details"]
  });
 }));
}
export function buildOwnerAgentMetrics(summary){
 if(!summary||summary.readOnly!==true||!summary.counts)throw new Error("INVALID_AGENT_SUMMARY");
 const counts={};
 for(const key of ["active","pendingApproval","completed","failed"]){
  const value=summary.counts[key];
  if(!Number.isSafeInteger(value)||value<0)throw new Error("INVALID_AGENT_METRIC");
  counts[key]=value;
 }
 return Object.freeze({counts,readOnly:true,approvalsInteractive:false});
}
