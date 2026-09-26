export const FINANCE_WATCH_RECOVERY_VERSION="2026-09-25.v1";
export function decideFinanceWatchRecovery({checkpoint=null,verification=null,attempt=0}={}){
 if(verification?.verified===true)return Object.freeze({decision:"checkpoint",resumeFrom:null,retry:false,executionAllowed:false});
 if(Number(attempt)>=2)return Object.freeze({decision:"owner_attention",resumeFrom:checkpoint?.id||null,retry:false,executionAllowed:false});
 return Object.freeze({decision:"retry_observation",resumeFrom:checkpoint?.id||null,retry:true,executionAllowed:false});
}