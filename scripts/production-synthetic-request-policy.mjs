// This POST only evaluates supplied signals; the adapter has no DB or
// external-service collaborator. All other write methods remain mutations.
export function isSafeUiMutation(method,path){
  const verb=String(method||"").toUpperCase();
  if(["GET","HEAD","OPTIONS"].includes(verb))return false;
  if(verb==="POST"&&path==="/api/ai/operator/queue")return false;
  return !!path;
}
