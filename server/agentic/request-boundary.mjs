// Transport-independent, default-off request boundary. Not mounted on any HTTP server.
// Production adapters must derive actor and tenant from authenticated server session,
// enforce CSRF and rate limits, and persist transitions atomically.
export function createAgenticRequestHandlers({store,enabled=false}={}){
 if(!store || typeof store.create!=="function" || typeof store.summary!=="function")throw new Error("INVALID_WORKFLOW_STORE");
 const authorize=(context,permission)=>{
  if(enabled!==true)throw new Error("AGENT_WORKFLOWS_DISABLED");
  const actor=context?.session?.actor,tenantId=context?.session?.tenantId;
  if(!actor?.id||!tenantId||actor.tenantId!==tenantId||actor[permission]!==true)throw new Error("WORKFLOW_FORBIDDEN");
  return {actor,tenantId};
 };
 return Object.freeze({
  create(context,body){
   const {actor,tenantId}=authorize(context,"canCreateWorkflow");
   if(!body || typeof body!=="object" || Array.isArray(body))throw new Error("INVALID_REQUEST");
   return store.create({actor,tenantId,objective:body.objective,workflowId:body.workflowId});
  },
  transition(context,body){
   const {actor,tenantId}=authorize(context,body?.to==="approved"?"canApproveWorkflow":"canExecuteWorkflow");
   if(!body || typeof body!=="object" || Array.isArray(body))throw new Error("INVALID_REQUEST");
   return store.transition({tenantId,actor,id:body.id,to:body.to,expectedVersion:body.expectedVersion,proposalDigest:body.proposalDigest});
  },
  summary(context){
   const {actor,tenantId}=authorize(context,"canViewWorkflows");
   return store.summary({tenantId,actor});
  }
 });
}
