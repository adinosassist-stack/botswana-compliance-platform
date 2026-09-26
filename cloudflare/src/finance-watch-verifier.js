export const FINANCE_WATCH_VERIFIER_VERSION="2026-09-25.v1";
export function verifyFinanceObservation({requestedTools=[],results={}}={}){
 const missing=[],failed=[];for(const key of requestedTools){if(!Object.prototype.hasOwnProperty.call(results,key))missing.push(key);else if(results[key]?.available!==true||results[key]?.allowed===false)failed.push(key)}
 const verified=missing.length===0&&failed.length===0;
 return Object.freeze({verified,status:verified?"verified":"incomplete",missing:Object.freeze(missing),failed:Object.freeze(failed),executionAllowed:false,mayAdvanceCheckpoint:verified});
}