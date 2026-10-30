import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../public/js/api-client.js', import.meta.url), 'utf8');
function harness(fetchImpl) {
  const timers = new Map(), logs = [];
  let nextTimer = 0;
  const window = {
    location: {href: 'https://thebedesk.com/app/', origin: 'https://thebedesk.com'},
    document: {querySelector: () => ({content: 'production'})},
    crypto: {randomUUID: () => 'test-correlation-id'},
  };
  vm.runInNewContext(source, {window, URL, Headers, AbortController, FormData,
    fetch: fetchImpl, console: {error: (...args) => logs.push(args)},
    setTimeout: fn => {timers.set(++nextTimer, fn); return nextTimer;},
    clearTimeout: id => timers.delete(id),
  });
  return {client: window.BW.api.createClient({timeoutMs: 18000, retries: 0}), logs,
    expire: () => {for (const fn of [...timers.values()]) fn();}, timers};
}
const options = {method: 'POST', body: JSON.stringify({question: 'PRIVATE_TEST_PROMPT'}), idempotencyKey: false};
const target = '/api/ai/advisor?private=PRIVATE_TEST_QUERY';

for (const rejection of ['abort-reason', 'type-error', 'abort-error']) {
  test(`request deadline is a timeout when fetch rejects with ${rejection}`, async () => {
    const h = harness((_url, {signal}) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(rejection === 'type-error'
        ? new TypeError('invalid_argument') : rejection === 'abort-error'
          ? new DOMException('Aborted', 'AbortError') : signal.reason), {once: true});
    }));
    const result = h.client.request(target, options).catch(error => error);
    h.expire();
    const error = await result;
    assert.equal(error.code, 'timeout');
    assert.equal(error.status, 0);
    assert.equal(error.requestId, 'test-correlation-id');
    assert.match(error.message, /timed out/);
    assert.equal(h.timers.size, 0);
  });
}

test('a genuine fetch failure remains network_error and emits readable allowlisted diagnostics', async () => {
  const h = harness(async () => {throw new TypeError('PRIVATE_PROVIDER_ERROR');});
  await assert.rejects(h.client.request(target, options), error => error.code === 'network_error');
  assert.equal(h.logs.length, 1);
  const [label, encoded] = h.logs[0];
  assert.equal(label, 'BW API request failed');
  assert.equal(typeof encoded, 'string', 'browser console readers must receive serialized fields');
  const diagnostic = JSON.parse(encoded);
  assert.deepEqual(Object.keys(diagnostic).sort(), ['attempt', 'code', 'method', 'path', 'requestId', 'status', 'timeoutMs', 'transport']);
  assert.equal(diagnostic.path, '/api/ai/advisor');
  assert.equal(diagnostic.code, 'network_error');
  assert.equal(diagnostic.requestId, 'test-correlation-id');
  assert.equal(diagnostic.timeoutMs, 18000);
  assert.doesNotMatch(encoded, /PRIVATE_|https:|csrf|cookie|authorization/i);
  assert.equal(h.timers.size, 0);
});

test('caller cancellation stays aborted even when fetch rejects with its string reason', async () => {
  const h = harness((_url, {signal}) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {once: true});
  }));
  const parent = new AbortController();
  const result = h.client.request(target, {...options, signal: parent.signal}).catch(error => error);
  parent.abort('user-cancelled');
  assert.equal((await result).code, 'aborted');
  assert.equal(h.logs.length, 0);
  assert.equal(h.timers.size, 0);
});

test('authoritative HTTP errors retain server status and code', async () => {
  const h = harness(async () => new Response(JSON.stringify({error: 'ai_unavailable'}), {
    status: 503, headers: {'content-type': 'application/json'},
  }));
  await assert.rejects(h.client.request(target, options), error => error.status === 503 && error.code === 'ai_unavailable');
  assert.equal(h.timers.size, 0);
});
