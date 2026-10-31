// Read-only readiness timing helper. Never print SQL, credentials or request bodies.
export async function measureReadinessSteps(steps,{clock=()=>performance.now(),budgetMs=15000}={}){
  if(!Array.isArray(steps)||steps.length===0)throw Error('readiness_steps_required');
  const results=[];const began=clock();
  for(const step of steps){
    if(!/^[a-z][a-z0-9_]{0,39}$/.test(step?.name||'')||typeof step.run!=='function')throw Error('readiness_invalid_step');
    const start=clock();
    try{
      if(clock()-began>=budgetMs)return {ok:false,reason:'budget_exceeded',steps:results};
      const ok=await step.run();
      results.push({name:step.name,elapsedMs:Math.max(0,Math.round(clock()-start)),ok:ok===true});
      if(ok!==true)return {ok:false,reason:'check_failed',steps:results};
      // An individual D1 check may finish after the overall deadline.
      // Record its duration but never report a successful readiness probe beyond budget.
      if(clock()-began>=budgetMs)return {ok:false,reason:'budget_exceeded',steps:results};
    }catch{
      results.push({name:step.name,elapsedMs:Math.max(0,Math.round(clock()-start)),ok:false});
      return {ok:false,reason:'check_failed',steps:results};
    }
  }
  return {ok:true,steps:results};
}
