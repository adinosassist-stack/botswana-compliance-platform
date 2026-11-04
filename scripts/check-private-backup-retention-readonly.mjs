// Read-only R2 candidate-retention policy assessor.
// Rule configuration is not proof of object-level retention enforcement.
const RULE_ID='candidates-30-day-retention';
const PREFIX='candidates/';
const AGE_SECONDS=2592000;
const fail=code=>{throw Error('r2_retention_readback_hold_'+code)};
export function inspectCandidateRetentionPolicy(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||
     payload.success!==true||!payload.result||!Array.isArray(payload.result.rules))fail('unverified_response');
  const rules=payload.result.rules;
  // Avoid mistaking an unrelated lock policy or an ambiguous duplicate for our intended protection.
  if(rules.length!==1)fail('unexpected_rule_set');
  const r=rules[0];
  if(!r||typeof r!=='object'||Array.isArray(r)||r.id!==RULE_ID||
     r.enabled!==true||r.prefix!==PREFIX||
     !r.condition||typeof r.condition!=='object'||Array.isArray(r.condition)||
     r.condition.type!=='Age'||r.condition.maxAgeSeconds!==AGE_SECONDS)fail('policy_mismatch');
  return Object.freeze({
    kind:'r2_candidate_retention_readback_only',bucket:'bw-compliance-ops-backups',
    ruleId:RULE_ID,prefix:PREFIX,configuredRetentionDays:30,
    exactPolicyReadbackMatched:true,existingObjectRetentionIndependentlyVerified:false,
    representativeObjectDeleteBlockedObserved:false,operatorAccessIndependentlyReviewed:false,
    retentionEnforced:false,restoreAuthorized:false,productionWriteAuthorized:false,
    disposition:'HOLD_OBJECT_LEVEL_ENFORCEMENT_AND_INDEPENDENT_RECOVERY_ACCEPTANCE'
  });
}
export async function readCandidateRetentionPolicy({accountId,token,fetchImpl=fetch}){
  if(accountId!=='ddd23cab31928a4bb3d4998df9b26d1d'||
     typeof token!=='string'||!token.trim())fail('authority');
  const url='https://api.cloudflare.com/client/v4/accounts/'+accountId+'/r2/buckets/bw-compliance-ops-backups/lock';
  let response;
  try{response=await fetchImpl(url,{method:'GET',redirect:'error',
    signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+token}})}
  catch{fail('transport');}
  if(!response.ok)fail('provider_refused');
  let data;
  try{data=await response.json()}catch{fail('invalid_response')}
  return inspectCandidateRetentionPolicy(data);
}
