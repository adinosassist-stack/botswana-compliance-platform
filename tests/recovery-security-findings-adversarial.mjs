import './v81-delegated-authority-static.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import scanner, { __scannerTest } from '../cloudflare/scanner/worker.js';
import { __recoverySecurityFindingsTest as edgeSecurity } from '../cloudflare/src/worker.js';
import { passwordResetTimingFloor as nodePasswordResetTimingFloor } from '../server/password-reset-timing.js';

const worker=fs.readFileSync('cloudflare/src/worker.js','utf8');
const productionEntry=fs.readFileSync('cloudflare/src/production-entry.js','utf8');
const agenticEntry=fs.readFileSync('cloudflare/src/agentic-entry.js','utf8');
const releaseGovernanceEntry=fs.readFileSync('cloudflare/src/release-governance-entry.js','utf8');
const server=fs.readFileSync('server/server.js','utf8');
const wrangler=fs.readFileSync('cloudflare/wrangler.toml','utf8');
const scannerCfg=fs.readFileSync('cloudflare/scanner/wrangler.toml','utf8');
const domSecurity=fs.readFileSync('public/js/dom-security.js','utf8');
const indexHtml=fs.readFileSync('public/index.html','utf8');

const TIMING_FLOOR_TEST_MS=50;
const TIMER_RESOLUTION_TOLERANCE_MS=2;

test('password reset responses use an explicit minimum+jitter timing floor on edge and Node',async()=>{
  const a=await edgeSecurity.passwordResetTimingFloor(Date.now(),{minMs:TIMING_FLOOR_TEST_MS,jitterMs:0});
  const b=await nodePasswordResetTimingFloor(Date.now(),{minMs:TIMING_FLOOR_TEST_MS,jitterMs:0});
  assert.equal(a.targetMs,TIMING_FLOOR_TEST_MS);
  assert.ok(a.elapsedMs>=a.targetMs-TIMER_RESOLUTION_TOLERANCE_MS,`edge timing floor returned too early: elapsed=${a.elapsedMs} target=${a.targetMs}`);
  assert.equal(b.targetMs,TIMING_FLOOR_TEST_MS);
  assert.ok(b.elapsedMs>=b.targetMs-TIMER_RESOLUTION_TOLERANCE_MS,`node timing floor returned too early: elapsed=${b.elapsedMs} target=${b.targetMs}`);
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

test('startup availability recovery exposes only the public shell when bootstrap leaves every surface hidden',()=>{
  const start=domSecurity.indexOf('function installStartupSurfaceFailSafe()');
  assert.ok(start>=0,'startup surface fail-safe must be installed');
  const block=domSecurity.slice(start,start+4200);
  assert.match(block,/global\.__THEBE_STARTUP_SURFACE_FAILSAFE__===true/);
  assert.match(block,/"marketingGate","authGate","appShell","roleAccessPortal","reporterPortal","publicPassportGate"/);
  assert.match(block,/marketing\.classList\.remove\("hidden"\)/);
  assert.match(block,/marketing\.style\.visibility="visible"/);
  assert.match(block,/app\.style\.visibility="hidden"/);
  assert.match(block,/recoverIfBlank\("startup_timeout"\)/);
  assert.match(block,/recoverIfBlank\("startup_timeout_extended"\)/);
  assert.doesNotMatch(block,/app\.style\.visibility="visible"/,'fail-safe must never expose authenticated workspace content');
});

test('plain root stays public for guests and releases only after the application proves a workspace session',()=>{
  const start=domSecurity.indexOf('function installPublicRootLandingGuard()');
  assert.ok(start>=0,'public root landing guard must be installed');
  const block=domSecurity.slice(start,start+7600);
  assert.match(block,/global\.__THEBE_PUBLIC_ROOT_LANDING_GUARD__===true/);
  assert.match(block,/path!=="\/"\|\|specialPublicFlow/);
  assert.match(block,/hash\.startsWith\("#report="\)\|\|hash\.startsWith\("#passport="\)/);
  assert.match(block,/marketing-start-action/);
  assert.match(block,/\[data-guest-action\]/);
  assert.match(block,/marketing-session-action/);
  assert.match(block,/const hasVerifiedWorkspaceSession=/);
  assert.match(block,/global\.syncMarketingSessionActions\?\.\(\)/);
  assert.match(block,/\.some\(el=>el\.hidden===false\)/);
  assert.match(block,/const releaseForVerifiedWorkspaceSession=/);
  assert.match(block,/reason:"verified_workspace_session"/);
  assert.match(block,/if\(releaseForVerifiedWorkspaceSession\(reason\)\)return false/);
  assert.match(indexHtml,/function syncMarketingSessionActions\(\)\{\s*const canResume=isWorkspaceRole\(currentUser\?\.role\)/);
  assert.match(indexHtml,/if\(!isWorkspaceRole\(currentUser\?\.role\)\)\{showRestrictedRolePortal\(currentUser\?\.role\);return\}/);
  assert.match(block,/marketing\.classList\.remove\("hidden"\)/);
  assert.match(block,/rolePortal\.style\.display="none"/);
  assert.match(block,/app\.style\.visibility="hidden"/);
  assert.doesNotMatch(block,/app\.style\.visibility="visible"/,'root guard must never expose authenticated workspace content automatically');
});

test('production launch wrapper chain has no configured scanner provider and evidence uploads remain disabled',()=>{
  assert.match(wrangler,/main = "src\/release-governance-entry\.js"/);
  assert.match(releaseGovernanceEntry,/import base from "\.\/agentic-entry\.js"/);
  assert.match(releaseGovernanceEntry,/const response=await base\.fetch\(request,env,ctx\)/);
  assert.match(releaseGovernanceEntry,/return base\.scheduled\(event,env,ctx\)/);
  assert.match(agenticEntry,/import base from "\.\/production-entry\.js"/);
  assert.match(agenticEntry,/const response=await base\.fetch\(request,env,ctx\)/);
  assert.match(agenticEntry,/return base\.scheduled\(event,env,ctx\)/);
  assert.match(productionEntry,/import worker from "\.\/worker\.js"/);
  assert.match(productionEntry,/worker\.fetch\(request,env,ctx\)/);
  assert.match(productionEntry,/worker\.scheduled\(event,env,ctx\)/);
  assert.match(wrangler,/EVIDENCE_UPLOADS_ENABLED = "false"/);
  assert.doesNotMatch(wrangler,/CLOUDMERSIVE|cloudmersive/);
  assert.doesNotMatch(scannerCfg,/CLOUDMERSIVE|cloudmersive/);
  assert.doesNotMatch(scannerCfg,/\[\[routes\]\]/);
  assert.doesNotMatch(scannerCfg,/\[secrets\]/);
  assert.match(scannerCfg,/SCANNER_PROVIDER = "disabled"/);
  assert.doesNotMatch(worker,/SAFE_LAUNCH_SCANNER_SECRET|thebe-desk-safe-launch-evidence-disabled/);
  assert.equal(fs.existsSync('cloudflare/src/worker-cloudmersive-free.js'),false);
});
