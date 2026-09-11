import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import scanner, { __scannerTest } from '../cloudflare/scanner/worker.js';
import { __recoverySecurityFindingsTest as edgeSecurity } from '../cloudflare/src/worker.js';
import { passwordResetTimingFloor as nodePasswordResetTimingFloor } from '../server/password-reset-timing.js';

const worker=fs.readFileSync('cloudflare/src/worker.js','utf8');
const server=fs.readFileSync('server/server.js','utf8');
const wrangler=fs.readFileSync('cloudflare/wrangler.toml','utf8');
const scannerCfg=fs.readFileSync('cloudflare/scanner/wrangler.toml','utf8');

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

test('scanner surface is provider-neutral and fails closed before body work or external access',async()=>{
  let providerCalled=false,bodyRead=false;
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{providerCalled=true;throw new Error('provider must not be reached')};
  try{
    const req={url:'https://scanner.invalid/scan',method:'POST',headers:new Headers({'content-type':'application/pdf'}),async arrayBuffer(){bodyRead=true;return new ArrayBuffer(1)}};
    const res=await scanner.fetch(req,{},{});
    assert.equal(res.status,503);
    assert.deepEqual(await res.json(),{error:'scanner_provider_not_configured'});
    assert.equal(bodyRead,false);
    assert.equal(providerCalled,false);
    assert.equal(__scannerTest.enabled,false);
    assert.equal(__scannerTest.provider,null);
  }finally{globalThis.fetch=original}
});

test('production launch has no configured scanner provider and evidence uploads remain disabled',()=>{
  assert.match(wrangler,/main = "src\/worker\.js"/);
  assert.match(wrangler,/EVIDENCE_UPLOADS_ENABLED = "false"/);
  assert.doesNotMatch(wrangler,/CLOUDMERSIVE|cloudmersive/);
  assert.doesNotMatch(scannerCfg,/CLOUDMERSIVE|cloudmersive/);
  assert.doesNotMatch(scannerCfg,/\[\[routes\]\]/);
  assert.doesNotMatch(scannerCfg,/\[secrets\]/);
  assert.match(scannerCfg,/SCANNER_PROVIDER = "disabled"/);
  assert.doesNotMatch(worker,/SAFE_LAUNCH_SCANNER_SECRET|thebe-desk-safe-launch-evidence-disabled/);
  assert.equal(fs.existsSync('cloudflare/src/worker-cloudmersive-free.js'),false);
});
