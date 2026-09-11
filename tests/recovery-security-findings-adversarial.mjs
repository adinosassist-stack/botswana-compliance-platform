import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import scanner, { __scannerTest } from '../cloudflare/scanner/worker.js';
import { __recoverySecurityFindingsTest as edgeSecurity } from '../cloudflare/src/worker.js';
import { passwordResetTimingFloor as nodePasswordResetTimingFloor } from '../server/password-reset-timing.js';

const worker=fs.readFileSync('cloudflare/src/worker.js','utf8');
const server=fs.readFileSync('server/server.js','utf8');
const wrangler=fs.readFileSync('cloudflare/wrangler.toml','utf8');
const secret='s'.repeat(48);
const env={EVIDENCE_SCAN_SECRET:secret,CLOUDMERSIVE_API_KEY:'k'.repeat(32),MAX_SCAN_BYTES:'3500000'};
const evidenceId='11111111-2222-3333-4444-555555555555';
const body=Buffer.from('%PDF-1.7\nsecurity regression evidence');
const sha=createHash('sha256').update(body).digest('hex');
function signature({size=body.length,timestamp=Date.now(),requestId=randomUUID(),mime='application/pdf'}={}){
  const base=__scannerTest.scanRequestSignatureBase({evidenceId,claimedSha:sha,claimedSize:String(size),timestamp:String(timestamp),requestId,mime});
  return {size:String(size),timestamp:String(timestamp),requestId,mime,sig:createHmac('sha256',secret).update(base).digest('hex')};
}
function fakeScanRequest(headers,{onRead=()=>{}}={}){
  return {url:'https://evidence-scanner.thebedesk.com/scan',method:'POST',headers:new Headers(headers),async arrayBuffer(){onRead();return body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength)}};
}

test('password reset responses use an explicit minimum+jitter timing floor on edge and Node',async()=>{
  const a=await edgeSecurity.passwordResetTimingFloor(Date.now(),{minMs:8,jitterMs:0});
  const b=await nodePasswordResetTimingFloor(Date.now(),{minMs:8,jitterMs:0});
  assert.equal(a.targetMs,8);assert.ok(a.elapsedMs>=8);
  assert.equal(b.targetMs,8);assert.ok(b.elapsedMs>=8);
});

test('password reset email delivery is removed from the synchronous response path',()=>{
  const edgeStart=worker.indexOf('if(url.pathname==="/api/auth/password-reset/request"&&req.method==="POST")');
  const edgeBlock=worker.slice(edgeStart,edgeStart+3200);
  assert.match(edgeBlock,/const passwordResetStartedAt=Date\.now\(\)/);
  assert.match(edgeBlock,/ctx\?\.waitUntil\)ctx\.waitUntil\(deliveryTask\)/);
  assert.match(edgeBlock,/await passwordResetTimingFloor\(passwordResetStartedAt\)/);
  assert.doesNotMatch(edgeBlock,/const delivered=await deliverPasswordReset/);

  const nodeStart=server.indexOf('app.post("/api/auth/password-reset/request"');
  const nodeBlock=server.slice(nodeStart,nodeStart+3600);
  assert.match(nodeBlock,/const passwordResetStartedAt=Date\.now\(\)/);
  assert.match(nodeBlock,/setImmediate\(\(\)=>\{void \(async\(\)=>\{/);
  assert.match(nodeBlock,/await passwordResetTimingFloor\(passwordResetStartedAt\)/);
  const asyncStart=nodeBlock.indexOf('setImmediate(()=>{void (async()=>{');
  const emailCall=nodeBlock.indexOf('await sendTransactionalEmail',asyncStart);
  const asyncEnd=nodeBlock.indexOf('})().catch(()=>{})});',asyncStart);
  const timingFloor=nodeBlock.indexOf('await passwordResetTimingFloor(passwordResetStartedAt)',asyncEnd);
  assert.ok(asyncStart>=0&&emailCall>asyncStart&&asyncEnd>emailCall&&timingFloor>asyncEnd,'email delivery stays inside detached task and timing floor precedes response');
});

test('scanner rejects a bad HMAC before reading the request body or calling the provider',async()=>{
  const meta=signature();let bodyRead=false,providerCalled=false;
  const original=globalThis.fetch;globalThis.fetch=async()=>{providerCalled=true;throw new Error('provider must not be reached')};
  try{
    const req=fakeScanRequest({'content-type':meta.mime,'content-length':meta.size,'x-evidence-id':evidenceId,'x-evidence-sha256':sha,'x-evidence-size':meta.size,'x-evidence-timestamp':meta.timestamp,'x-evidence-request-id':meta.requestId,'x-evidence-signature':'0'.repeat(64)},{onRead:()=>{bodyRead=true}});
    const res=await scanner.fetch(req,env,{});
    assert.equal(res.status,401);assert.equal((await res.json()).error,'signature_invalid');assert.equal(bodyRead,false);assert.equal(providerCalled,false);
  }finally{globalThis.fetch=original}
});

test('scanner rejects an expired signed envelope before reading the request body',async()=>{
  const meta=signature({timestamp:Date.now()-__scannerTest.MAX_SIGNATURE_AGE_MS-1000});let bodyRead=false;
  const req=fakeScanRequest({'content-type':meta.mime,'content-length':meta.size,'x-evidence-id':evidenceId,'x-evidence-sha256':sha,'x-evidence-size':meta.size,'x-evidence-timestamp':meta.timestamp,'x-evidence-request-id':meta.requestId,'x-evidence-signature':meta.sig},{onRead:()=>{bodyRead=true}});
  const res=await scanner.fetch(req,env,{});
  assert.equal(res.status,401);assert.equal((await res.json()).error,'signature_expired');assert.equal(bodyRead,false);
});

test('production scanner envelope authenticates size, time, request id and MIME before body verification',()=>{
  assert.match(worker,/scan:v2:\$\{row\.id\}:\$\{row\.content_sha256\|\|""\}:\$\{scanSize\}:\$\{scanTimestamp\}:\$\{scanRequestId\}:\$\{scanMime\}/);
  for(const header of ['x-evidence-size','x-evidence-timestamp','x-evidence-request-id','x-evidence-signature'])assert.ok(worker.includes(`"${header}"`));
  assert.match(wrangler,/main = "src\/worker\.js"/);
  assert.doesNotMatch(worker,/SAFE_LAUNCH_SCANNER_SECRET|thebe-desk-safe-launch-evidence-disabled/);
  assert.equal(fs.existsSync('cloudflare/src/worker-cloudmersive-free.js'),false);
});
