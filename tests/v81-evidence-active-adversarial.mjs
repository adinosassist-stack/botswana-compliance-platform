import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const wrangler=fs.readFileSync('cloudflare/wrangler.toml','utf8');
const worker=fs.readFileSync('cloudflare/src/worker.js','utf8');
const scanner=fs.readFileSync('cloudflare/scanner/worker.js','utf8');
const scannerCfg=fs.readFileSync('cloudflare/scanner/wrangler.toml','utf8');
const preflight=fs.readFileSync('cloudflare/preflight-production.sh','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('production release activates evidence uploads and requires the scanner secret',()=>{
  assert.match(wrangler,/EVIDENCE_UPLOADS_ENABLED = "true"/);
  assert.match(wrangler,/"EVIDENCE_SCAN_SECRET"/);
  assert.match(preflight,/EVIDENCE_UPLOADS_ENABLED must be true/);
  assert.match(preflight,/EVIDENCE_SCAN_SECRET/);
  assert.match(preflight,/EVIDENCE_SCAN_API_URL must be credential-free HTTPS/);
});

test('emergency kill switch and 3.5MB boundary remain fail closed',()=>{
  assert.match(worker,/evidence_uploads_temporarily_disabled/);
  assert.match(worker,/EVIDENCE_MAX_BYTES\s*=\s*3_500_000/);
  assert.match(worker,/evidenceMutationDisabled/);
});

test('base worker retains quarantine scan and clean-only download boundary',()=>{
  assert.match(worker,/async function scanEvidenceObject/);
  assert.match(worker,/scan_status='clean'/);
  assert.match(worker,/review_status='approved'/);
  assert.match(worker,/x-evidence-signature/);
  assert.match(worker,/x-evidence-scan-signature/);
  assert.match(worker,/EVIDENCE_SCAN_SECRET/);
});

test('dedicated scanner validates signed envelope and SHA before Cloudmersive',()=>{
  assert.match(scanner,/x-evidence-id/);
  assert.match(scanner,/x-evidence-sha256/);
  assert.match(scanner,/x-evidence-size/);
  assert.match(scanner,/x-evidence-timestamp/);
  assert.match(scanner,/x-evidence-request-id/);
  assert.match(scanner,/x-evidence-signature/);
  assert.match(scanner,/scan:v2:/);
  assert.match(scanner,/sha256_mismatch/);
  assert.match(scanner,/signature_invalid/);
  assert.match(scanner,/https:\/\/api\.cloudmersive\.com\/virus\/scan\/file/);
  assert.match(scanner,/headers:\{Apikey:/);
  assert.match(scanner,/form\.append\("inputFile"/);
  assert.match(scanner,/x-evidence-scan-signature/);
  assert.match(scannerCfg,/pattern = "evidence-scanner\.thebedesk\.com"/);
  assert.match(scannerCfg,/required = \["EVIDENCE_SCAN_SECRET", "CLOUDMERSIVE_API_KEY"\]/);
});

test('selected-file upload failure does not silently save metadata',()=>{
  const start=html.indexOf('async function addEvidence()');
  const block=html.slice(start,start+3500);
  assert.match(block,/Evidence upload failed and was not saved/);
  const catchPos=block.indexOf('Evidence upload failed and was not saved');
  const returnPos=block.indexOf('return false',catchPos);
  const savePos=block.indexOf('updateActiveCompany',catchPos);
  assert.ok(returnPos>catchPos && (savePos<0 || returnPos<savePos));
});

test('evidence mutations permit owner manager reviewer but keep auditor read-only',()=>{
  const routes=[
    'if(url.pathname==="/api/evidence/presign"&&req.method==="POST")',
    'if(url.pathname.match(/^\\/api\\/evidence\\/[^/]+\\/upload$/)&&req.method==="PUT")',
    'if(url.pathname.match(/^\\/api\\/evidence\\/[^/]+\\/complete$/)&&req.method==="POST")',
    'if(url.pathname.match(/^\\/api\\/evidence\\/[^/]+\\/scan-retry$/)&&req.method==="POST")'
  ];
  for(const marker of routes){
    const at=worker.indexOf(marker);
    assert.ok(at>=0,`missing ${marker}`);
    const block=worker.slice(at,at+700);
    assert.match(block,/roleAllowed\(a,"owner","manager","reviewer"\)/);
    assert.doesNotMatch(block,/roleAllowed\(a,"owner","manager","reviewer","auditor"\)/);
  }
  const download=worker.slice(worker.indexOf('if(url.pathname.match(/^\\/api\\/evidence\\/[^/]+\\/download$/)'),worker.indexOf('if(url.pathname.match(/^\\/api\\/evidence\\/[^/]+\\/download$/)')+700);
  assert.match(download,/roleAllowed\(a,"owner","manager","reviewer","auditor"\)/);
});

test('successful uploads and manual retries kick scanning immediately with scheduled fallback intact',()=>{
  assert.match(worker,/function kickEvidenceScan\(ctx,env\)/);
  assert.match(worker,/ctx\.waitUntil\(processEvidenceScanQueue\(env,1\)/);
  assert.ok((worker.match(/kickEvidenceScan\(ctx,env\)/g)||[]).length>=4);
  assert.match(worker,/summary\.evidenceScanning=await processEvidenceScanQueue\(env,10\)/);
});
