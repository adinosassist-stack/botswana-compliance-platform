/**
 * Inert composition boundary for a future protected General AI route.
 * No route is wired here. Provider execution is never allowed until a durable
 * atomic reservation succeeds. A reservation remains held on ambiguous failure.
 */
export async function runBudgetedAiRequest({
  tenantId,period,requestId,maxCostMicroUsd,db,reserve,provider,recordUsage
}={}){
  if(typeof reserve!=="function"||typeof provider!=="function"||
     typeof recordUsage!=="function")throw Error("ai_budget_pipeline_unavailable");
  await reserve(db,{tenantId,period,requestId,amountMicroUsd:maxCostMicroUsd});
  // If provider fails or accounting fails, do NOT release reservation:
  // billed tokens may have been consumed and must be reconciled separately.
  let received=false;
  const onUsage=async usage=>{
    if(received)throw Error("ai_usage_duplicate_callback");
    received=true;
    await recordUsage(db,tenantId,{...usage,requestId});
  };
  const result=await provider({onUsage});
  if(!received)throw Error("ai_usage_not_recorded");
  return result;
}
