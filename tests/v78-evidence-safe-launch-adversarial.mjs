import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import workerDefault, { __requestBoundaryTest as boundary } from '../cloudflare/src/worker.js';

const wrangler = fs.readFileSync('cloudflare/wrangler.toml', 'utf8');
const worker = fs.readFileSync('cloudflare/src/worker.js', 'utf8');
const url = path => new URL(`https://thebedesk.com${path}`);

test('production keeps evidence uploads disabled until scanner integration is explicitly qualified', () => {
  assert.match(wrangler, /EVIDENCE_UPLOADS_ENABLED = "false"/);
  assert.equal(boundary.evidenceUploadsEnabled({ EVIDENCE_UPLOADS_ENABLED: 'false' }), false);
  assert.equal(boundary.evidenceUploadsEnabled({}), false);
  assert.equal(boundary.evidenceUploadsEnabled({ EVIDENCE_UPLOADS_ENABLED: 'TRUE' }), true);
});

test('all evidence ingestion/finalization mutations fail closed while uploads are disabled', () => {
  const blocked = [
    ['POST', '/api/evidence/presign'],
    ['POST', '/api/evidence/integrity-upload'],
    ['POST', '/api/evidence/upload'],
    ['PUT', '/api/evidence/e1/upload'],
    ['POST', '/api/evidence/e1/complete'],
    ['POST', '/api/evidence/e1/scan-retry']
  ];
  for (const [method, path] of blocked) assert.equal(boundary.evidenceMutationDisabled(url(path), method), true, `${method} ${path}`);
  assert.equal(boundary.evidenceMutationDisabled(url('/api/evidence'), 'GET'), false);
  assert.equal(boundary.evidenceMutationDisabled(url('/api/evidence/e1/download'), 'GET'), false);
});

test('unauthenticated evidence mutation is rejected by the central auth gate before kill-switch disclosure', async () => {
  const request = new Request('https://thebedesk.com/api/evidence/presign', {
    method: 'POST', body: '{}', headers: { 'content-type': 'application/json' }
  });
  const response = await workerDefault.fetch(request, { EVIDENCE_UPLOADS_ENABLED: 'false' }, {});
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'unauthenticated' });
});

test('disabled-mode readiness is native to deployment readiness and no fake scanner credentials exist', () => {
  assert.doesNotMatch(worker, /SAFE_LAUNCH_SCANNER_URL|SAFE_LAUNCH_SCANNER_SECRET|thebe-desk-safe-launch-evidence-disabled/);
  assert.match(worker, /const evidenceScannerRequired=evidenceUploadsEnabled\|\|!!evidenceScanApiUrl\|\|!!evidenceScanSecret/);
  assert.doesNotMatch(wrangler, /EVIDENCE_SCAN_API_URL = "https:\/\/example\.com/);
});

test('3.5 MB cap is enforced inside the active production worker', () => {
  assert.equal(boundary.EVIDENCE_MAX_BYTES, 3_500_000);
  assert.match(worker, /const EVIDENCE_MAX_BYTES=3_500_000/);
  assert.match(worker, /readBytesBounded\(req,\{maxBytes:EVIDENCE_MAX_BYTES\}\)/);
});
