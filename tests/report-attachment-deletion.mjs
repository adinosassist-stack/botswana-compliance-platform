import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Bucket} from './helpers/report-attachment-bucket.mjs';
import {reportDatabase} from './helpers/report-attachment-database.mjs';
const module=await import('../cloudflare/src/report-attachments-entry.js');
assert.equal(typeof module.purgeDailyReportAttachments,'function','tenant deletion must have a governed attachment cleanup implementation');
const {default:withReportAttachments,purgeDailyReportAttachments,reportAttachmentPrefix}=module;
function fixture(){
  const bucket=new Bucket(),{db,DB}=reportDatabase();let selected='report-1';
  const core={fetch:async()=>Response.json({ok:true,reportId:selected})};
  const runtime=withReportAttachments(core);
  const env={DB,EVIDENCE:bucket,SESSION_SECRET:'test-secret-'.repeat(4),AUDIT_INTEGRITY_SECRET:'test-audit-'.repeat(4),PUBLIC_RATE_LIMITER:{limit:async()=>({success:true})}};
  async function grant(report='report-1'){selected=report;const response=await runtime.fetch(new Request('https://example.test/public/daily-reporting/submit',{method:'POST',headers:{'x-thebe-report-attachments':'1'}}),env,{});return (await response.json()).attachmentUploadGrant;}
  function upload(token){return runtime.fetch(new Request('https://example.test/public/daily-reporting/attachments',{method:'POST',headers:{'x-report-attachment-grant':token},body:JSON.stringify({attachments:[{name:'private-proof.jpg',type:'image/jpeg',data:Buffer.from([255,216,255,1]).toString('base64')}]})}),env,{});}
  function claim(){db.exec("INSERT INTO deletion_requests(id,tenant_id,user_id,status,processing_token) VALUES('dr1','t1','u1','processing','claim-1')");}
  const purge=()=>purgeDailyReportAttachments(env,{tenantId:'t1',requestId:'dr1',claimToken:'claim-1'});
  return {bucket,db,env,grant,upload,claim,purge};
}
{
  const f=fixture();
  f.db.exec("INSERT INTO daily_employee_reports(id,tenant_id,employee_id,location_id,report_date) VALUES('report-3','t1','e1','l1','2026-10-16'),('report-4','t1','e1','l1','2026-10-15')");
  for(const id of ['report-1','report-2','report-3','report-4'])assert.equal((await f.upload(await f.grant(id))).status,200);
  const oldGrant=await f.grant();
  await assert.rejects(f.purge,/claim_lost/);
  f.claim();
  f.db.exec("INSERT INTO legal_holds(id,tenant_id,reason) VALUES('hold','t1','Synthetic hold')");
  const before=f.bucket.rows.size;await assert.rejects(f.purge,/legal_hold_active/);assert.equal(f.bucket.rows.size,before);
  f.db.exec("UPDATE legal_holds SET active=0,status='released'");
  assert.equal((await f.upload(oldGrant)).status,409,'approved/processing deletion blocks outstanding upload grants');
  assert.equal((await f.purge()).done,false,'large cleanup must return an honest continuation');
  assert.equal((await f.purge()).done,true,'durable progress must resume on the next invocation');
  for(const id of ['report-1','report-3','report-4']){
    const prefix=await reportAttachmentPrefix(id),rows=[...f.bucket.rows].filter(([key])=>key.startsWith(prefix));
    assert.equal(rows.length,1,'customer files must be removed');
    assert.equal(rows[0][0],prefix+'manifest.json');assert.deepEqual(JSON.parse(rows[0][1].data),{deleted:true},'only a hash-keyed, content-free replay fence remains');
  }
  const otherPrefix=await reportAttachmentPrefix('report-2');
  assert.equal([...f.bucket.rows.keys()].filter(key=>key.startsWith(otherPrefix)).length,2,'other tenant storage must remain unchanged');
  // Exercise the actual production finalizer against the complete real schema.
  const source=fs.readFileSync('cloudflare/src/worker.js','utf8');
  const constants=source.slice(source.indexOf('const TENANT_NON_CASCADE_PURGE_SQL='),source.indexOf('const TENANT_DELETION_EVIDENCE_BATCH='));
  const finalizer=source.slice(source.indexOf('async function finalizeTenantDeletion('),source.indexOf('async function processDeletionRequest('));
  const finalize=new Function('activeLegalHold','tenantDeletionFingerprint','releaseTenantDeletionClaim',constants+finalizer+'return finalizeTenantDeletion;')(
    async(env,tenant)=>env.DB.prepare("SELECT id FROM legal_holds WHERE tenant_id=? AND active=1 AND status='active'").bind(tenant).first(),
    async()=> 'synthetic-report-deletion-fingerprint',async()=>true);
  assert.equal((await finalize(f.env,{id:'dr1',tenant_id:'t1'},'claim-1')).ok,true);
  assert.equal(f.db.prepare("SELECT id FROM daily_employee_reports WHERE tenant_id='t1'").get(),undefined);
  assert.equal((await f.upload(oldGrant)).status,409,'old grants stay unusable after SQL records are purged');
  f.db.close();
}
for(const stage of ['beforePut','afterPut']){
  const f=fixture(),token=await f.grant();let resume,started;
  const paused=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>resume=resolve);let once=true;
  f.bucket[stage]=async(key,data)=>{if(once&&data instanceof Uint8Array&&data.byteLength>0){once=false;started();await gate;}};
  const pending=f.upload(token);await paused;f.claim();assert.equal((await f.purge()).done,true);resume();
  assert.equal((await pending).status,409,'deletion must defeat an upload paused '+stage+' sensitive-byte storage');
  const prefix=await reportAttachmentPrefix('report-1');
  const rows=[...f.bucket.rows].filter(([key])=>key.startsWith(prefix));assert.equal(rows.length,1);
  assert.deepEqual(JSON.parse(rows[0][1].data),{deleted:true});
  f.db.close();
}
{
  const f=fixture();assert.equal((await f.upload(await f.grant())).status,200);f.claim();
  const remove=f.bucket.delete.bind(f.bucket);f.bucket.delete=async()=>{throw new Error('storage unavailable');};
  await assert.rejects(f.purge,/storage unavailable/);
  assert.ok(f.db.prepare("SELECT id FROM tenants WHERE id='t1'").get(),'storage failure must not pretend tenant cleanup is complete');
  f.bucket.delete=remove;assert.equal((await f.purge()).done,true,'partial cleanup must retry safely');f.db.close();
}
{
  const f=fixture();assert.equal((await f.upload(await f.grant())).status,200);f.claim();
  f.db.exec("UPDATE deletion_requests SET status='approved',processing_token=NULL WHERE id='dr1'");
  const source=fs.readFileSync('cloudflare/src/worker.js','utf8');
  const deletionCode=source.slice(source.indexOf('async function activeLegalHold('),source.indexOf('async function sha256ArrayBuffer('));
  const processDeletion=new Function('hmacHex','purgeDailyReportAttachments',deletionCode+'return processDeletionRequest;')(
    async()=> 'synthetic-full-report-deletion-fingerprint',purgeDailyReportAttachments);
  const remove=f.bucket.delete.bind(f.bucket);f.bucket.delete=async()=>{throw new Error('storage unavailable');};
  assert.equal((await processDeletion(f.env,'dr1')).error,'report_attachment_cleanup_failed');
  assert.equal(f.db.prepare("SELECT status FROM deletion_requests WHERE id='dr1'").get().status,'failed');
  assert.ok(f.db.prepare("SELECT id FROM tenants WHERE id='t1'").get());
  f.bucket.delete=remove;
  f.db.exec("INSERT INTO daily_employee_reports(id,tenant_id,employee_id,location_id,report_date) VALUES('report-3','t1','e1','l1','2026-10-16'),('report-4','t1','e1','l1','2026-10-15'); UPDATE deletion_requests SET attempts=99 WHERE id='dr1'");
  assert.equal((await processDeletion(f.env,'dr1')).inProgress,true);
  assert.equal(f.db.prepare("SELECT attempts FROM deletion_requests WHERE id='dr1'").get().attempts,99,'successful continuation must not exhaust the failure retry budget');
  assert.equal((await processDeletion(f.env,'dr1')).status,'completed','the real claimed deletion workflow must clean attachments before SQL finalization');
  assert.equal(f.db.prepare("SELECT id FROM tenants WHERE id='t1'").get(),undefined);
  assert.ok(f.db.prepare("SELECT id FROM tenants WHERE id='t2'").get());f.db.close();
}
console.log('Report attachment deletion: real-schema finalization, tenant isolation, holds, resumability, storage failure and both upload/deletion races PASS');
