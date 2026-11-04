import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {
 verifyRecurringBackupEnvironment,validateRecurringApprovalPair,
 verifyRecurringBackupAuthorization
} from '../scripts/authorize-recurring-private-backup.mjs';
import {prepareBackup} from '../scripts/prepare-private-d1-backup.mjs';

const now=Date.parse('2026-11-04T20:00:00Z');
const source='a'.repeat(40);
const account='ddd23cab31928a4bb3d4998df9b26d1d';
const env={
 GITHUB_REPOSITORY:'adinosassist-stack/botswana-compliance-platform',
 GITHUB_EVENT_NAME:'schedule',GITHUB_REF:'refs/heads/main',
 GITHUB_SHA:source,EXPECTED_SHA:source,
 GITHUB_TOKEN:'test-github-token',GITHUB_RUN_ID:'1234',GITHUB_RUN_ATTEMPT:'1',
 PRIVATE_BACKUP_SCHEDULE_ENABLED:'true',
 PRIVATE_BACKUP_SCHEDULE_OWNER_APPROVAL_ID:'31001',
 PRIVATE_BACKUP_SCHEDULE_REVIEW_APPROVAL_ID:'31002',
 PRIVATE_BACKUP_ACCOUNT_ID:account,
 PRIVATE_BACKUP_CLOUDFLARE_TOKEN:'test-dedicated-backup-token'
};
const payload={
 scope:'HOURLY_PRIVATE_D1_CANDIDATE_EXPORT_ONLY',sourceSha:source,
 accountId:account,databaseId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',
 bucket:'bw-compliance-ops-backups',prefix:'candidates/',
 maxIntervalMinutes:120,retentionDays:30,
 retentionAndAccessAccepted:true,dedicatedCredentialScopeAccepted:true,
 expiresAt:'2026-11-06T20:00:00Z'
};
function record(id,user,changes={}){
 const p={...payload,...(changes.payload||{})};
 return {id,user:{login:user},
  issue_url:'https://api.github.com/repos/adinosassist-stack/botswana-compliance-platform/issues/1950',
  created_at:'2026-11-04T19:00:00Z',
  body:'THEBE_RECURRING_BACKUP_APPROVAL\n'+JSON.stringify(p),
  ...Object.fromEntries(Object.entries(changes).filter(([k])=>k!=='payload'))};
}
const valid=()=>({ownerRecord:record(31001,'adinosassist-stack'),reviewerRecord:record(31002,'thusico'),now});

test('two distinct authenticated short-lived exact-main records permit ONLY bounded private export',()=>{
 const p=validateRecurringApprovalPair(env,valid());
 assert.equal(p.kind,'short_lived_private_backup_schedule_authorized');
 assert.equal(p.sourceSha,env.GITHUB_SHA);
 assert.equal(p.ownerCommentId,31001);
 assert.equal(p.independentCommentId,31002);
 assert.equal(p.restoreAuthorized,false);
 assert.equal(p.productionDeploymentAuthorized,false);
 assert.equal(p.paymentActivationAuthorized,false);
});

test('any disabled, wrong-event, unreviewed, stale, retry or missing-secret schedule fails closed',()=>{
 const variants=[
 {PRIVATE_BACKUP_SCHEDULE_ENABLED:'false'},
 {PRIVATE_BACKUP_SCHEDULE_ENABLED:''},
 {GITHUB_EVENT_NAME:'workflow_dispatch'},
 {GITHUB_REF:'refs/heads/feature'},
 {GITHUB_REPOSITORY:'attacker/repo'},
 {EXPECTED_SHA:'b'.repeat(40)},
 {GITHUB_SHA:'x'},
 {GITHUB_RUN_ATTEMPT:'2'},
 {GITHUB_RUN_ID:'../10'},
 {PRIVATE_BACKUP_ACCOUNT_ID:'b'.repeat(32)},
 {GITHUB_TOKEN:''},
 {PRIVATE_BACKUP_CLOUDFLARE_TOKEN:''},
 {PRIVATE_BACKUP_SCHEDULE_REVIEW_APPROVAL_ID:'31001'},
 {PRIVATE_BACKUP_SCHEDULE_OWNER_APPROVAL_ID:''}
 ];
 for(const patch of variants){
  assert.throws(()=>verifyRecurringBackupEnvironment({...env,...patch}),/recurring_backup_hold_authority/);
 }
});

test('forged or wrong author/issue/id/expiry/source/scope fails before production provider access',()=>{
 const v=valid();
 const variants=[
 {...v,ownerRecord:record(31001,'thusico')},
 {...v,reviewerRecord:record(31002,'adinosassist-stack')},
 {...v,reviewerRecord:record(31003,'thusico')},
 {...v,reviewerRecord:record(31002,'thusico',{issue_url:'https://api.github.com/repos/other/repo/issues/1950'})},
 {...v,ownerRecord:record(31001,'adinosassist-stack',{body:'approve'})},
 {...v,reviewerRecord:record(31002,'thusico',{payload:{sourceSha:'b'.repeat(40)}})},
 {...v,reviewerRecord:record(31002,'thusico',{payload:{retentionAndAccessAccepted:false}})},
 {...v,reviewerRecord:record(31002,'thusico',{payload:{dedicatedCredentialScopeAccepted:false}})},
 {...v,reviewerRecord:record(31002,'thusico',{payload:{expiresAt:'2026-11-07T20:00:00Z'}})},
 {...v,ownerRecord:record(31001,'adinosassist-stack',{payload:{expiresAt:'2026-11-04T19:01:00Z'}})},
 {...v,ownerRecord:record(31001,'adinosassist-stack',{payload:{expiresAt:'2026-11-15T20:00:00Z'}})},
 {...v,ownerRecord:record(31001,'adinosassist-stack',{payload:{extra:true}})},
 {...v,ownerRecord:record(31001,'adinosassist-stack',{created_at:'2026-11-05T19:00:00Z'})},
 {...v,ownerRecord:record(31001,'adinosassist-stack',{created_at:'2026-10-25T19:00:00Z'})}
 ];
 for(const item of variants)assert.throws(()=>validateRecurringApprovalPair(env,item),/recurring_backup_hold_/);
});

test('GitHub GET verifies current main and both live authenticated comments',async()=>{
 const urls=[];
 const fetchImpl=async(url,opts)=>{
  urls.push({url,opts});
  if(url.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:source}});
  if(url.endsWith('/issues/comments/31001'))return Response.json(record(31001,'adinosassist-stack'));
  if(url.endsWith('/issues/comments/31002'))return Response.json(record(31002,'thusico'));
  throw Error('unexpected endpoint');
 };
 const result=await verifyRecurringBackupAuthorization(env,{fetchImpl,now});
 assert.equal(result.ownerCommentId,31001);
 assert.equal(urls.length,3);
 for(const call of urls){
  assert.equal(call.opts.method,'GET');
  assert.equal(call.opts.redirect,'error');
  assert.equal(call.opts.headers.Authorization,'Bearer '+env.GITHUB_TOKEN);
  assert.equal(call.url.startsWith('https://api.github.com/repos/adinosassist-stack/botswana-compliance-platform/'),true);
 }
});

test('stale live main blocks before either approval record is fetched',async()=>{
 let count=0;
 const fetchImpl=async()=>{count++;return Response.json({object:{sha:'b'.repeat(40)}})};
 await assert.rejects(verifyRecurringBackupAuthorization(env,{fetchImpl,now}),/recurring_backup_hold_stale_main/);
 assert.equal(count,1);
});

test('missing or inaccessible GitHub approval fails without leaking provider response',async()=>{
 const fetchImpl=async()=>new Response('secret-token-in-error',{status:403});
 let error;
 try{await verifyRecurringBackupAuthorization(env,{fetchImpl,now})}catch(e){error=e}
 assert.equal(error?.message,'recurring_backup_hold_github_refused');
 assert.equal(String(error).includes('secret-token-in-error'),false);
});

test('scheduled backup must fail before ANY Cloudflare call when proof fails',async()=>{
 let providerCalls=0;
 await assert.rejects(prepareBackup(env,{
  authorizeSchedule:async()=>{throw Error('blocked-by-independent-review')},
  fetchImpl:async()=>{providerCalls++;throw Error('unexpected provider call')}
 }),/blocked-by-independent-review/);
 assert.equal(providerCalls,0);
 await assert.rejects(prepareBackup(env,{
  authorizeSchedule:async()=>({kind:'short_lived_private_backup_schedule_authorized',
   sourceSha:source,restoreAuthorized:true,productionDeploymentAuthorized:false}),
  fetchImpl:async()=>{providerCalls++;throw Error('unexpected provider call')}
 }),/private_backup_schedule_authority/);
 assert.equal(providerCalls,0);
});

test('default-off hourly workflow is isolated, serialized and cannot be a production deploy',()=>{
 const y=readFileSync(new URL('../.github/workflows/recurring-private-backup-candidate.yml',import.meta.url),'utf8');
 assert.match(y,/cron: '17 \* \* \* \*'/);
 assert.match(y,/github\.event_name == 'schedule'/);
 assert.match(y,/vars\.PRIVATE_BACKUP_SCHEDULE_ENABLED == 'true'/);
 assert.match(y,/environment: operations-recurring-backup/);
 assert.match(y,/secrets\.PRIVATE_BACKUP_SCHEDULE_CLOUDFLARE_TOKEN/);
 assert.match(y,/thebe-isolated-operations-rehearsals/);
 assert.match(y,/cancel-in-progress: false/);
 assert.match(y,/node --test tests\/recurring-private-backup-authority\.test\.mjs/);
 assert.doesNotMatch(y,/wrangler\s+deploy|d1\s+execute|RESTORE_VERSIONED_CANDIDATE/);
});
