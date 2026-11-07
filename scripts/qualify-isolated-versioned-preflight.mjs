// Metadata-only preflight. No SQL bytes, destructive probes, imports or authority grants.
export const EVIDENCE=Object.freeze({
 accountId:'ddd23cab31928a4bb3d4998df9b26d1d',
 sourceId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',
 targetId:'be15acba-ba16-4704-9498-e296a164b3a2',
 targetName:'bw-compliance-os-ops-restore-candidate-20261103',
 bucket:'bw-compliance-ops-backups',
 candidateKey:'candidates/42293276778/1/production-d1.sql',
 candidateSize:3393714, lockId:'candidates-30-day-retention',
 lockPrefix:'candidates/',lockSeconds:2592000
});
const fail=code=>{throw Error('versioned_preflight_hold_'+code)};
const objectsOf=p=>Array.isArray(p?.result)?p.result:Array.isArray(p?.result?.objects)?p.result.objects:null;
export function assessIsolatedVersionedPreflight({lock,objects,target,expectedMainSha,observedMainSha}){
 if(!/^[0-9a-f]{40}$/.test(expectedMainSha||'')||expectedMainSha!==observedMainSha)fail('stale_main');
 if(lock?.success!==true||!Array.isArray(lock?.result?.rules)||lock.result.rules.length!==1)fail('lock_unavailable');
 const r=lock.result.rules[0];
 if(r?.id!==EVIDENCE.lockId||r.enabled!==true||r.prefix!==EVIDENCE.lockPrefix||
 r.condition?.type!=='Age'||r.condition?.maxAgeSeconds!==EVIDENCE.lockSeconds)fail('lock_drift');
 const found=objectsOf(objects);
 if(objects?.success!==true||!found||found.length!==1||found[0]?.key!==EVIDENCE.candidateKey||
 found[0]?.size!==EVIDENCE.candidateSize)fail('candidate_mismatch');
 if(target?.success!==true||target.result?.uuid!==EVIDENCE.targetId||
 target.result?.name!==EVIDENCE.targetName||target.result?.num_tables!==0)fail('target_not_empty');
 return Object.freeze({kind:'isolated_versioned_preflight_metadata_only',
 exactLockReadback:true,exactCandidateListing:true,emptyTargetMetadata:true,sourceSha:expectedMainSha,
 candidateKey:EVIDENCE.candidateKey,candidateBytes:EVIDENCE.candidateSize,
 objectBytesRehashed:false,foreignKeysInspected:false,objectDeleteBlockedObserved:false,
 retentionEnforced:false,restoreAuthorized:false,restorePerformed:false,productionWriteAuthorized:false,
 disposition:'HOLD_FOR_INDEPENDENT_OBJECT_ENFORCEMENT_AND_RESTORE_AUTHORIZATION'});
}
export async function readIsolatedVersionedPreflight({accountId,token,expectedMainSha,observedMainSha,fetchImpl=fetch}){
 if(accountId!==EVIDENCE.accountId||typeof token!=='string'||!token.trim())fail('authority');
 const root=`https://api.cloudflare.com/client/v4/accounts/${accountId}`;
 const urls=[`${root}/r2/buckets/${EVIDENCE.bucket}/lock`,
 `${root}/r2/buckets/${EVIDENCE.bucket}/objects?prefix=${encodeURIComponent('candidates/42293276778/1/')}&per_page=10`,
 `${root}/d1/database/${EVIDENCE.targetId}`];
 const replies=[];
 for(const url of urls){
  let res;try{res=await fetchImpl(url,{method:'GET',redirect:'error',
   headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(12000)});}
  catch{fail('provider_network')}
  if(!res?.ok)fail('provider_refused');
  let data;try{const body=await res.text();if(body.length>262144)fail('oversize');data=JSON.parse(body)}
  catch{fail('provider_invalid_json')}
  replies.push(data);
 }
 return assessIsolatedVersionedPreflight({lock:replies[0],objects:replies[1],target:replies[2],expectedMainSha,observedMainSha});
}
