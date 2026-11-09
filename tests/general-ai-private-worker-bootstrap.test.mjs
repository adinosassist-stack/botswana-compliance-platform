import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import bootstrap from '../cloudflare/src/general-ai-private-worker-bootstrap.js';
import {readAndVerifyBootstrapSource, verifyBootstrapSource} from '../scripts/verify-general-ai-private-worker-bootstrap.mjs';

const config = readFileSync(new URL('../cloudflare/wrangler.general-ai-private-worker-bootstrap.toml', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../cloudflare/src/general-ai-private-worker-bootstrap.js', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/general-ai-private-worker-bootstrap-protected.yml', import.meta.url), 'utf8');
const v = (patch = {}) => verifyBootstrapSource({config, entry, workflow, ...patch});

test('default Worker offers fetch-only; every request returns non-cacheable 503', async () => {
  assert.deepEqual(Object.keys(bootstrap), ['fetch']);
  let access = 0;
  const env = new Proxy({}, {get() {access++;throw Error('forbidden binding');}});
  for (const method of ['GET','POST','PUT','DELETE','OPTIONS']) {
    const result = await bootstrap.fetch(new Request('https://placeholder.invalid/',{method}),env,{});
    assert.equal(result.status, 503);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await result.text(), 'Service unavailable');
  }
  assert.equal(access, 0);
});

test('pinned inert deployment config and protected workflow qualify without credentials', () => {
  assert.equal(readAndVerifyBootstrapSource(),true);
});

test('adversarial capability changes fail closed', () => {
  for (const addition of ['workers_dev = true','preview_urls = true','[[queues.consumers]]','[[d1_databases]]','[[services]]','route = "example.com/*"','[vars]']) {
    assert.throws(() => v({config: config + '\n' + addition + '\n'}));
  }
  assert.throws(() => v({entry: entry.replace('status: 503','status: 200')}));
  assert.throws(() => v({entry: entry + '\nconst secret = env.API_KEY;'}));
  assert.throws(() => v({workflow: workflow.replace('environment: general-ai-private-staging', 'environment: production')}));
  assert.throws(() => v({workflow: workflow.replace('GENERAL_AI_QUEUE_BOOTSTRAP_CLOUDFLARE_TOKEN','PRODUCTION_CLOUDFLARE_TOKEN')}));
});
