import test from 'node:test';
import assert from 'node:assert/strict';
import {discover} from '../scripts/discover-regulatory-staging-metadata.mjs';
const productionId = '11111111-1111-4111-8111-111111111111';
const stagingId = '22222222-2222-4222-8222-222222222222';
const accountId = 'a'.repeat(32);
test('only metadata GETs; excludes production regardless of name; allowlisted output', async () => {
  const urls = [];
  const result = await discover({token: 'private', productionId, fetchImpl: async (url, options) => {
    urls.push(url); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    return {ok: true, json: async () => ({success: true, result: url.includes('/d1/') ? [
      {uuid: productionId, name: 'production-staging'},
      {uuid: stagingId, name: 'regulatory-staging', extra: 'private'},
      {uuid: stagingId, name: 'contest'},
    ] : [{id: accountId}]})};
  }});
  assert.equal(urls.length, 2);
  assert.ok(urls.every(url => !url.includes('/query')));
  assert.deepEqual(result.candidates, [{accountId, databaseId: stagingId, databaseName: 'regulatory-staging'}]);
  assert.ok(!JSON.stringify(result).includes('private'));
});
test('provider failures never expose echoed token or response body', async () => {
  await assert.rejects(discover({token: 'private', productionId, fetchImpl: async () => {throw new Error('private');}}), /details suppressed/);
});
test('missing exclusion fails before provider access', async () => {
  await assert.rejects(discover({token: 'private', productionId: '', fetchImpl: () => assert.fail('unexpected request')}), /exclusion UUID required/);
});
test('full pages cannot silently truncate discovery', async () => {
  let calls = 0;
  await assert.rejects(discover({token: 'private', productionId, fetchImpl: async () => {
    calls++; return {ok: true, json: async () => ({success: true, result: Array(50).fill({id: accountId})})};
  }}), /pagination limit/);
  assert.equal(calls, 20);
});
