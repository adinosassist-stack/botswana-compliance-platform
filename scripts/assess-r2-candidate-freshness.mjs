// Observational R2 candidate metadata recency check. Not a recovery-point qualification.
// No SQL bytes, exports, credentials, writes or restore operations in this assessor.
const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
const BUCKET='bw-compliance-ops-backups';
const KEY=/^candidates\/[1-9][0-9]*\/[1-9][0-9]*\/production-d1\.sql$/;
const fail=x=>{throw Error('backup_cadence_hold_'+x)};
const timestamp=x=>{const t=Date.parse(x);if(typeof x!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(x)||!Number.isFinite(t)||new Date(t).toISOString().slice(0,19)!==x.slice(0,19))fail('time');return t};
export function assessCandidateFreshness({lock,listing,observedAt}){
 const now=timestamp(observedAt);
 if(lock?.success!==true||!Array.isArray(lock.result?.rules)||lock.result.rules.length!==1)fail('lock_unverified');
 const r=lock.result.rules[0];
 if(r?.id!=='candidates-30-day-retention'||r.enabled!==true||r.prefix!=='candidates/'||
    r.condition?.type!=='Age'||r.condition?.maxAgeSeconds!==2592000)fail('policy_drift');
 // A truncated listing is not exhaustive and cannot establish the newest candidate.
 if(listing?.success!==true||!Array.isArray(listing.result)||listing.result.length>1000||
    listing.result.some(x=>!x||typeof x!=='object')||listing.result_info?.cursor||
    listing.cursor||listing.truncated===true)fail('listing_unverified');
 // The scoped listing must not contain malformed or duplicated object keys.
 // Such a response cannot establish which backup metadata was actually seen.
 const keys=listing.result.map(x=>x.key);
 if(keys.some(key=>typeof key!=='string'||!key.startsWith('candidates/'))||
    new Set(keys).size!==keys.length)fail('listing_keys_unverified');
 const points=listing.result.filter(x=>KEY.test(x.key));
 if(points.length===0)fail('no_sql_candidates');
 const stamps=points.map(x=>{
  if(!Number.isSafeInteger(x.size)||x.size<=0||x.size>25*1024*1024)fail('size');
  const t=timestamp(x.last_modified);
  if(t>now)fail('future_candidate');
  return {key:x.key,time:t};
 }).sort((a,b)=>a.time-b.time);
 const mostRecent=stamps.at(-1);
 let maxObservedGapMinutes=0;
 for(let i=1;i<stamps.length;i++)maxObservedGapMinutes=Math.max(maxObservedGapMinutes,(stamps[i].time-stamps[i-1].time)/60000);
 const latestAgeMinutes=(now-mostRecent.time)/60000;
 const stale=latestAgeMinutes>120;
 return Object.freeze({kind:'r2_backup_candidate_metadata_freshness_only',
  bucket:BUCKET,observedAt,listedSqlCandidates:points.length,
  newestCandidateKey:mostRecent.key,newestCandidateLastModified:new Date(mostRecent.time).toISOString(),
  latestAgeMinutes:Number(latestAgeMinutes.toFixed(2)),maxObservedCandidateGapMinutes:Number(maxObservedGapMinutes.toFixed(2)),
  exceedsTwoHourRecencyThreshold:stale,
  actualExportFinishedAtVerified:false,receiptAndBytesMatched:false,
  schedulerCadenceVerified:false,sustainedRpoQualified:false,restoreAuthorized:false,
  productionWriteAuthorized:false,disposition:stale?'HOLD_STALE_BACKUP_CANDIDATE_METADATA':'HOLD_RECEIPTS_SUSTAINED_RPO_AND_RESTORE'});
}
export async function readCandidateFreshness({accountId,token,observedAt=new Date().toISOString(),fetchImpl=fetch}){
 if(accountId!==ACCOUNT||typeof token!=='string'||!token.trim())fail('authority');
 const root='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/r2/buckets/'+BUCKET;
 const request=async path=>{
  let r;try{r=await fetchImpl(root+path,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{Authorization:'Bearer '+token,Accept:'application/json'}})}catch{fail('network')}
  if(!r?.ok)fail('provider_refused');
  let raw;try{raw=await r.text();if(raw.length>262144)fail('response_too_large');return JSON.parse(raw)}catch{fail('invalid_response')}
 };
 const lock=await request('/lock');
 const listing=await request('/objects?prefix=candidates%2F&per_page=1000');
 return assessCandidateFreshness({lock,listing,observedAt});
}
