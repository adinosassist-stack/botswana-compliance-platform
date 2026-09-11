import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import wrapperDefault, { __cloudmersiveFreeTierTest as boundary } from '../cloudflare/src/worker-cloudmersive-free.js';

const wrangler = fs.readFileSync('cloudflare/wrangler.toml', 'utf8');
const wrapper = fs.readFileSync('cloudflare/src/worker-cloudmersive-free.js', 'utf8');
const url = path => new URL(`https://thebedesk.com${path}`);

test('safe launch disables evidence uploads by default', () => {
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
  for (const [method, path] of blocked) {
    assert.equal(boundary.evidenceMutationDisabled(url(path), method), true, `${method} ${path}`);
  }
  assert.equal(boundary.evidenceMutationDisabled(url('/api/evidence'), 'GET'), false);
  assert.equal(boundary.evidenceMutationDisabled(url('/api/evidence/e1/download'), 'GET'), false);
});

test('blocked upload is stopped before the base worker', async () => {
  const request = new Request('https://thebedesk.com/api/evidence/presign', {
    method: 'POST',
    body: '{}',
    headers: { 'content-type': 'application/json' }
  });
  const response = await wrapperDefault.fetch(request, { EVIDENCE_UPLOADS_ENABLED: 'false' }, {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'evidence_uploads_temporarily_disabled',
    evidenceUploadsEnabled: false
  });
});

test('readiness bypass is scoped to disabled scanner checks and scheduled work receives the real env', () => {
  assert.match(wrapper, /SAFE_LAUNCH_SCANNER_URL/);
  assert.match(wrapper, /EVIDENCE_SCAN_API_URL: SAFE_LAUNCH_SCANNER_URL/);
  assert.match(wrapper, /EVIDENCE_SCAN_SECRET: SAFE_LAUNCH_SCANNER_SECRET/);
  assert.match(wrapper, /evidenceScannerRequired = false/);
  assert.match(wrapper, /return app\.scheduled\(event, env, ctx\);/);
  assert.doesNotMatch(wrangler, /EVIDENCE_SCAN_API_URL = "https:\/\/example\.com/);
});

test('3.5 MB cap remains intact for the future re-enable path', () => {
  assert.equal(boundary.EVIDENCE_FREE_TIER_MAX_BYTES, 3_500_000);
  assert.match(wrapper, /uploadsEnabled && isEvidenceByteUpload/);
  assert.match(wrapper, /uploadsEnabled && request\.method === "POST" && url\.pathname === "\/api\/evidence\/presign"/);
});
