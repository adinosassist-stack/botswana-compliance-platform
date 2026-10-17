import assert from 'node:assert/strict';
import withReportAttachments,{reportAttachmentPrefix} from '../cloudflare/src/report-attachments-entry.js';
import {logicalRequestPath} from '../cloudflare/src/agentic-entry.js';

import {Bucket} from './helpers/report-attachment-bucket.mjs';
import {reportDatabase} from './helpers/report-attachment-database.mjs';
const bucket=new Bucket();let scheduled=0,authorized=true;
const core={async fetch(req){
  if(new URL(req.url).pathname.endsWith('/submit'))return Response.json({ok:true,reportId:'report-1'});
  if(!authorized)return Response.json({error:'forbidden'}, {status:403});
  return Response.json({reports:[{id:'report-1',report_date:'2026-10-17'}]});
},async scheduled(){scheduled++;}};
const runtime=withReportAttachments(core,{logicalRequestPath});
const {db,DB}=reportDatabase();
const prefix=await reportAttachmentPrefix('report-1');
const env={DB,SESSION_SECRET:'test-secret-'.repeat(4),EVIDENCE:bucket,PUBLIC_RATE_LIMITER:{limit:async()=>({success:true})}};
async function grant(){const r=await runtime.fetch(new Request('https://example.test/public/daily-reporting/submit',{method:'POST',headers:{'x-thebe-report-attachments':'1'}}),env,{});return (await r.json()).attachmentUploadGrant;}
function upload(token,last=1){return runtime.fetch(new Request('https://example.test/public/daily-reporting/attachments',{method:'POST',headers:{'x-report-attachment-grant':token},body:JSON.stringify({attachments:[{name:'proof.jpg',type:'image/jpeg',data:Buffer.from([255,216,255,last]).toString('base64')}]})}),env,{});}
assert.equal((await upload('bad')).status,401);
const token=await grant();bucket.race=true;
const results=await Promise.all([upload(token,1),upload(token,2)]);
assert.deepEqual(results.map(r=>r.status).sort(),[200,409],'concurrent grant replay must commit exactly once');
assert.equal((await upload(token)).status,409,'serial replay must fail');
const manifest=JSON.parse(bucket.rows.get(prefix+'manifest.json').data);
assert.equal(manifest.attachments.length,1);
assert.ok(bucket.rows.has(manifest.attachments[0].key),'loser cleanup must preserve the committed attachment');
assert.equal(bucket.rows.size,2,'failed upload must not leave orphan objects');
const tokens=await Promise.all([grant(),grant()]);bucket.race=true;
const separate=await Promise.all(tokens.map((t,i)=>upload(t,i+3)));
assert.deepEqual(separate.map(r=>r.status).sort(),[200,409],'different grants must not overwrite a concurrent manifest update');
const losing=separate.findIndex(r=>r.status===409);
assert.equal((await upload(tokens[losing],losing+3)).status,200,'a rejected CAS can retry against the latest manifest');
assert.equal(JSON.parse(bucket.rows.get(prefix+'manifest.json').data).attachments.length,3);
bucket.failAfterCommit=true;
assert.equal((await upload(await grant(),5)).status,200,'a lost commit acknowledgement is resolved from persisted grant and object bindings');
const committed=JSON.parse(bucket.rows.get(prefix+'manifest.json').data);
assert.equal(committed.attachments.length,4);
assert.ok(committed.attachments.every(item=>bucket.rows.has(item.key)));
assert.equal(bucket.rows.size,5);
for(const url of [
  'https://example.test/api/daily-reporting/dashboard?date=2026-10-17',
  'https://example.test/?__thebe_api_path=%2Fapi%2Fdaily-reporting%2Fdashboard&__thebe_api_query=date%3D2026-10-17',
  'https://example.test/__thebe_api/daily-reporting/dashboard?date=2026-10-17'
]){
  const response=await runtime.fetch(new Request(url),env,{});
  assert.equal((await response.json()).reports[0].attachments.length,4,'dashboard metadata must survive every supported API transport');
}
const downloadPath='/api/daily-reporting/attachments/report-1/'+manifest.attachments[0].id;
for(const url of [
  'https://example.test'+downloadPath+'?date=2026-10-17',
  'https://example.test/?__thebe_api_path='+encodeURIComponent(downloadPath)+'&__thebe_api_query=date%3D2026-10-17'
]){
  const response=await runtime.fetch(new Request(url),env,{});
  assert.equal(response.status,200,'authorized downloads must work through supported API transports');
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.match(response.headers.get('content-disposition'),/^attachment;/);
  assert.equal((await response.arrayBuffer()).byteLength,4);
}
authorized=false;
assert.equal((await runtime.fetch(new Request('https://example.test/api/daily-reporting/attachments/report-1/'+manifest.attachments[0].id+'?date=2026-10-17'),env,{})).status,403);
await runtime.scheduled({},env,{});assert.equal(scheduled,1);
console.log('Report attachments runtime: concurrency, replay, authorization and scheduled delegation PASS');
db.close();
