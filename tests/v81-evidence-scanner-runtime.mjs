import test from 'node:test';
import assert from 'node:assert/strict';
import scanner,{__scannerTest} from '../cloudflare/scanner/worker.js';

test('disabled scanner health fails closed without a provider',async()=>{
  const r=await scanner.fetch(new Request('https://scanner.invalid/health'),{},{});
  assert.equal(r.status,503);
  assert.deepEqual(await r.json(),{ok:false,enabled:false,provider:null,error:'scanner_provider_not_configured'});
  assert.equal(__scannerTest.enabled,false);
  assert.equal(__scannerTest.provider,null);
});

test('disabled scanner rejects scan requests without reading the body or calling a provider',async()=>{
  let providerCalled=false,bodyRead=false;
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{providerCalled=true;throw new Error('provider must not be reached')};
  try{
    const req={url:'https://scanner.invalid/scan',method:'POST',headers:new Headers({'content-type':'application/pdf'}),async arrayBuffer(){bodyRead=true;return new ArrayBuffer(1)}};
    const r=await scanner.fetch(req,{},{});
    assert.equal(r.status,503);
    assert.deepEqual(await r.json(),{error:'scanner_provider_not_configured'});
    assert.equal(bodyRead,false);
    assert.equal(providerCalled,false);
  }finally{globalThis.fetch=original}
});

test('disabled scanner exposes no other public surface',async()=>{
  const r=await scanner.fetch(new Request('https://scanner.invalid/anything'),{},{});
  assert.equal(r.status,404);
  assert.deepEqual(await r.json(),{error:'not_found'});
});
