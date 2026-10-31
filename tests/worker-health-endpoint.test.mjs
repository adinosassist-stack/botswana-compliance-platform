import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/src/worker.js';
import releaseWorker from '../cloudflare/src/release-governance-entry.js';

function database(error) {
  const reads=[];
  return {reads,DB:{prepare(sql){
    reads.push(sql);
    assert.equal(sql,'SELECT 1 x','public health may only ping D1');
    return {async first(){if(error)throw error;return {x:1};}};
  }}};
}

for(const method of ['GET','HEAD']) {
  test(`public ${method} health checks D1 without session or readiness configuration`,async()=>{
    const f=database();
    const response=await worker.fetch(new Request('https://app.example/api/health',{method}),{DB:f.DB},{});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.ok,true);assert.equal(body.db,true);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(f.reads,['SELECT 1 x']);
    assert.equal(Object.hasOwn(body,'schemaReady'),false,'health must not imply schema readiness');
  });
}

test('D1 failure returns sanitized unavailable health',async()=>{
  const f=database(new Error('private database details'));
  const response=await worker.fetch(new Request('https://app.example/api/health'),{DB:f.DB},{});
  assert.equal(response.status,503);
  const body=await response.json();
  assert.equal(body.ok,false);assert.equal(body.db,false);
  assert.doesNotMatch(JSON.stringify(body),/private|database details/);
});

test('D1 daily quota retains sanitized retry guidance',async()=>{
  const f=database(new Error("private: exceeded D1's free tier daily row read limit"));
  const response=await worker.fetch(new Request('https://app.example/api/health'),{DB:f.DB},{});
  assert.equal(response.status,503);
  assert.ok(Number(response.headers.get('retry-after'))>0);
  const body=await response.json();
  assert.equal(body.error,'database_daily_limit_reached');
  assert.doesNotMatch(JSON.stringify(body),/private|free tier/);
});

test('production release entry exposes health but preserves diagnostics authentication',async()=>{
  const f=database();
  const response=await releaseWorker.fetch(new Request('https://app.example/api/health'),{DB:f.DB},{});
  assert.equal(response.status,200);assert.equal((await response.json()).db,true);
  const denied=await releaseWorker.fetch(new Request('https://app.example/api/ops/diagnostics'),{DB:f.DB},{});
  assert.equal(denied.status,401);
  assert.deepEqual(f.reads,['SELECT 1 x']);
});

test('health mutation and diagnostics still require authentication; liveness never reads storage',async()=>{
  const f=database();
  for(const [path,method] of [['/api/health','POST'],['/api/ops/diagnostics','GET']]) {
    const response=await worker.fetch(new Request('https://app.example'+path,{method}),{DB:f.DB},{});
    assert.equal(response.status,401);
    assert.equal((await response.json()).error,'unauthenticated');
  }
  const live=await worker.fetch(new Request('https://app.example/api/live'),{DB:f.DB},{});
  assert.equal(live.status,200);assert.deepEqual(await live.json(),{ok:true});
  assert.deepEqual(f.reads,[]);
});
