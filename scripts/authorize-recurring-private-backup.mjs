// Standalone, default-deny authorization for *unattended* private D1 exports.
// Two separately authenticated, short-lived GitHub approvals are required for every
// scheduled run. This is NOT production deployment or isolated restore approval.
const REPO='adinosassist-stack/botswana-compliance-platform';
const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
const DATABASE='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const BUCKET='bw-compliance-ops-backups';
const PREFIX='THEBE_RECURRING_BACKUP_APPROVAL\n';
const MAX_DURATION=7*24*60*60*1000;
const stop=code=>{throw Error('recurring_backup_hold_'+code)};
const isSha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const id=value=>typeof value==='string'&&/^[1-9][0-9]{0,14}$/.test(value)&&Number.isSafeInteger(Number(value));
export function verifyRecurringBackupEnvironment(e){
 if(e?.GITHUB_REPOSITORY!==REPO||e.GITHUB_EVENT_NAME!=='schedule'||
    e.GITHUB_REF!=='refs/heads/main'||!isSha(e.GITHUB_SHA)||
    e.EXPECTED_SHA!==e.GITHUB_SHA||e.PRIVATE_BACKUP_SCHEDULE_ENABLED!=='true'||
    e.PRIVATE_BACKUP_ACCOUNT_ID!==ACCOUNT||
    !e.PRIVATE_BACKUP_CLOUDFLARE_TOKEN?.trim()||!e.GITHUB_TOKEN?.trim()||
    !e.PRIVATE_BACKUP_SCHEDULE_R2_ACCESS_KEY_ID?.trim()||
    !e.PRIVATE_BACKUP_SCHEDULE_R2_SECRET_ACCESS_KEY?.trim()||
    !id(e.GITHUB_RUN_ID)||e.GITHUB_RUN_ATTEMPT!=='1'||
    !id(e.PRIVATE_BACKUP_SCHEDULE_OWNER_APPROVAL_ID)||
    !id(e.PRIVATE_BACKUP_SCHEDULE_REVIEW_APPROVAL_ID)||
    e.PRIVATE_BACKUP_SCHEDULE_OWNER_APPROVAL_ID===e.PRIVATE_BACKUP_SCHEDULE_REVIEW_APPROVAL_ID)
    stop('authority');
 return true;
}
function parseRecord(record,author,approvalId,sha,now){
 if(record?.id!==Number(approvalId)||record.user?.login!==author||
   record.issue_url!==`https://api.github.com/repos/${REPO}/issues/1950`||
   typeof record.body!=='string'||!record.body.startsWith(PREFIX))
   stop('record');
 let p;
 try{p=JSON.parse(record.body.slice(PREFIX.length));}catch{stop('record_json')}
 const expected={
  scope:'HOURLY_PRIVATE_D1_CANDIDATE_EXPORT_ONLY',
  sourceSha:sha,accountId:ACCOUNT,databaseId:DATABASE,bucket:BUCKET,
  prefix:'candidates/',maxIntervalMinutes:120,retentionDays:30,
  retentionAndAccessAccepted:true,dedicatedCredentialScopeAccepted:true,
  atomicConditionalUploadReviewed:true
 };
 if(!p||Array.isArray(p)||typeof p!=='object')stop('scope');
 const keys=Object.keys(expected).concat('expiresAt').sort();
 if(JSON.stringify(Object.keys(p).sort())!==JSON.stringify(keys)||
    Object.entries(expected).some(([key,value])=>p[key]!==value))stop('scope');
 if(typeof p.expiresAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(p.expiresAt))stop('expiry');
 const expires=Date.parse(p.expiresAt),created=Date.parse(record.created_at);
 if(!Number.isFinite(expires)||!Number.isFinite(created)||created>now||
    now-created>MAX_DURATION||expires<=now||expires-created>MAX_DURATION)
   stop('expired_or_invalid');
 return p.expiresAt;
}
export function validateRecurringApprovalPair(e,{ownerRecord,reviewerRecord,now=Date.now()}){
 verifyRecurringBackupEnvironment(e);
 if(!Number.isFinite(now))stop('clock');
 const ownerExpiry=parseRecord(ownerRecord,'adinosassist-stack',
    e.PRIVATE_BACKUP_SCHEDULE_OWNER_APPROVAL_ID,e.GITHUB_SHA,now);
 const reviewerExpiry=parseRecord(reviewerRecord,'thusico',
    e.PRIVATE_BACKUP_SCHEDULE_REVIEW_APPROVAL_ID,e.GITHUB_SHA,now);
 if(ownerExpiry!==reviewerExpiry)stop('approval_disagreement');
 return Object.freeze({kind:'short_lived_private_backup_schedule_authorized',
  sourceSha:e.GITHUB_SHA,expiresAt:ownerExpiry,
  ownerCommentId:ownerRecord.id,independentCommentId:reviewerRecord.id,
  databaseId:DATABASE,bucket:BUCKET,maxIntervalMinutes:120,
  restoreAuthorized:false,productionDeploymentAuthorized:false,
  paymentActivationAuthorized:false});
}
export async function verifyRecurringBackupAuthorization(e,{fetchImpl=fetch,now=Date.now()}={}){
 verifyRecurringBackupEnvironment(e);
 const root=`https://api.github.com/repos/${REPO}`;
 const get=async path=>{
   let r;
   try{r=await fetchImpl(root+path,{method:'GET',redirect:'error',
     signal:AbortSignal.timeout(15000),
     headers:{Authorization:`Bearer ${e.GITHUB_TOKEN}`,Accept:'application/vnd.github+json'}})}
   catch{stop('github_transport')}
   if(!r?.ok)stop('github_refused');
   let t;
   try{t=await r.text();}catch{stop('github_body')}
   if(t.length>32768)stop('github_oversize');
   try{return JSON.parse(t);}catch{stop('github_json')}
 };
 const main=await get('/git/ref/heads/main');
 if(main?.object?.sha!==e.GITHUB_SHA)stop('stale_main');
 const [ownerRecord,reviewerRecord]=await Promise.all([
   get('/issues/comments/'+e.PRIVATE_BACKUP_SCHEDULE_OWNER_APPROVAL_ID),
   get('/issues/comments/'+e.PRIVATE_BACKUP_SCHEDULE_REVIEW_APPROVAL_ID)
 ]);
 return validateRecurringApprovalPair(e,{ownerRecord,reviewerRecord,now});
}
