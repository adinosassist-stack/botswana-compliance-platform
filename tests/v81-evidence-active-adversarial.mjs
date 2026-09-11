import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const wrangler=fs.readFileSync('cloudflare/wrangler.toml','utf8');
const worker=fs.readFileSync('cloudflare/src/worker.js','utf8');
const preflight=fs.readFileSync('cloudflare/preflight-production.sh','utf8');
const deploy=fs.readFileSync('cloudflare/deploy-free.sh','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('production release keeps evidence uploads disabled when no approved scanner provider is configured',()=>{
  assert.match(wrangler,/EVIDENCE_UPLOADS_ENABLED = "false"/);
  assert.doesNotMatch(wrangler,/required = \[[^\]]*EVIDENCE_SCAN_SECRET/);
  assert.match(preflight,/EVIDENCE_UPLOADS_ENABLED must remain false/);
  assert.match(preflight,/EVIDENCE_SCAN_API_URL must be empty while evidence uploads are disabled/);
  assert.match(preflight,/EVIDENCE_SCAN_SECRET must not be required while evidence uploads are disabled/);
  assert.doesNotMatch(deploy,/secret put EVIDENCE_SCAN_SECRET/);
  assert.doesNotMatch(deploy,/CLOUDMERSIVE|cloudmersive/);
});

test('emergency kill switch and 3.5MB boundary remain fail closed',()=>{
  assert.match(worker,/evidence_uploads_temporarily_disabled/);
  assert.match(worker,/EVIDENCE_MAX_BYTES\s*=\s*3_500_000/);
  assert.match(worker,/evidenceMutationDisabled/);
});

test('base worker retains quarantine scan and clean-only download boundary for future approved scanner qualification',()=>{
  assert.match(worker,/async function scanEvidenceObject/);
  assert.match(worker,/scan_status='clean'/);
  assert.match(worker,/review_status='approved'/);
  assert.match(worker,/x-evidence-signature/);
  assert.match(worker,/x-evidence-scan-signature/);
  assert.match(worker,/EVIDENCE_SCAN_SECRET/);
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

test('evidence mutations permit owner manager reviewer but keep auditor read-only once the feature is re-enabled',()=>{
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

test('dormant scan queue controls remain intact for future provider integration',()=>{
  assert.match(worker,/function kickEvidenceScan\(ctx,env\)/);
  assert.match(worker,/ctx\.waitUntil\(processEvidenceScanQueue\(env,1\)/);
  assert.ok((worker.match(/kickEvidenceScan\(ctx,env\)/g)||[]).length>=4);
  assert.match(worker,/summary\.evidenceScanning=await processEvidenceScanQueue\(env,10\)/);
});
