import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessEmptyWorkerResourcePreflight as pre,
  assessEmptyWorkerResourcePostflight as post
} from '../scripts/quotation-empty-worker-resource-guard.mjs';

const name = 'bw-quotation-auth-private-staging';
const accountId = 'ddd23cab31928a4bb3d4998df9b26d1d';
const mainSha = '61168ac014b30f6b63bd3d6318adb44f56e5d2be';
const before = () => ({
  accountId, mainSha, legacyScripts: [{ id: 'unrelated' }],
  modernWorkers: [{ id: 'unrelated-id', name: 'unrelated' }],
  routes: [], domains: [],
  authCounts: ['users', 'memberships', 'sessions'].map(tab => ({ tab, n: 0 })),
  readOnlyVerified: true
});
const after = () => ({
  accountId,
  worker: {
    name, id: 'some-nonempty-worker-id', deployed_on: null,
    subdomain: {
      enabled: false, previews_enabled: false,
      url: 'https://' + name + '.example.workers.dev'
    }
  },
  workerVersions: [], workerDeployments: [], legacyScripts: [{ id: name }],
  modernWorkers: [{ name, id: 'some-nonempty-worker-id' }],
  routes: [], domains: [], bindings: [], sourceCodeUploaded: false
});

test('read-only proof accepts an absent resource with empty synthetic D1', () => {
  assert.deepEqual(pre(before()), { readyForSeparatelyApprovedCreate: true, failures: [] });
});
test('preflight refuses every missing, mismatched or non-empty critical evidence', () => {
  for (const field of Object.keys(before())) {
    const sample = before(); delete sample[field];
    assert.equal(pre(sample).readyForSeparatelyApprovedCreate, false, field);
  }
  const drift = before(); drift.mainSha = 'different';
  assert.equal(pre(drift).readyForSeparatelyApprovedCreate, false);
  const duplicate = before(); duplicate.modernWorkers.push({ name });
  assert.equal(pre(duplicate).readyForSeparatelyApprovedCreate, false);
  const row = before(); row.authCounts[1].n = 1;
  assert.equal(pre(row).readyForSeparatelyApprovedCreate, false);
  const route = before(); route.routes = [{ script: name, pattern: '*' }];
  assert.equal(pre(route).readyForSeparatelyApprovedCreate, false);
});
test('postflight requires never-deployed resource with URLs disabled and zero versions', () => {
  assert.deepEqual(post(after()), { noCodeNoTrafficVerified: true, failures: [] });
});
test('postflight refuses missing proof and inadvertent activation', () => {
  for (const field of Object.keys(after())) {
    const sample = after(); delete sample[field];
    assert.equal(post(sample).noCodeNoTrafficVerified, false, field);
  }
  const changes = [
    { worker: { ...after().worker, deployed_on: '2026-11-17T01:00:00Z' } },
    { worker: { ...after().worker, subdomain: { enabled: true, previews_enabled: false } } },
    { worker: { ...after().worker, subdomain: { enabled: false, previews_enabled: true } } },
    { workerVersions: [{ id: 'unexpected-version' }] },
    { workerDeployments: [{ id: 'unexpected-deploy' }] },
    { bindings: [{ name: 'AUTH_DB', type: 'd1' }] },
    { sourceCodeUploaded: true },
    { domains: [{ service: name }] },
    { routes: [{ script: name }] }
  ];
  for (const change of changes) {
    assert.equal(post({ ...after(), ...change }).noCodeNoTrafficVerified, false,
      JSON.stringify(change));
  }
});
