// Diagnostic-only durations. Never log requests, actor IDs, tenant IDs, prompts, SQL, or provider errors.
const STAGES=new Set(['context','credits','attachments','provider','refund','persistence']);
export function createAdvisorStageTimer(env,{clock=()=>performance.now(),log=console.info}={}){
 const enabled=env?.APP_ENV==='staging'&&env?.THEBE_ADVISOR_STAGE_TIMING==='1';
 return async function timeAdvisorStage(name,fn){
  if(!STAGES.has(name)||typeof fn!=='function')throw Error('invalid_advisor_stage');
  if(!enabled)return fn();
  const began=clock();let outcome='ok';
  try{return await fn()}catch(e){outcome='error';throw e}
  finally{
   const duration=Math.min(600000,Math.max(0,Math.round(clock()-began)));
   try{log(JSON.stringify({event:'thebe_ai_advisor_stage',stage:name,outcome,elapsedMs:duration}))}catch{}
  }
 };
}
