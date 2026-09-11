import test from 'node:test';
import assert from 'node:assert/strict';
import scanner from '../cloudflare/scanner/worker.js';

const env={EVIDENCE_SCAN_SECRET:'s'.repeat(48),CLOUDMERSIVE_API_KEY:'k'.repeat(32),MAX_SCAN_BYTES:'3500000'};

test('scanner health fails closed when secrets are absent',async()=>{
  const r=await scanner.fetch(new Request('https://evidence-scanner.thebedesk.com/health'),{},{});
  assert.equal(r.status,503);
  assert.deepEqual(await r.json(),{ok:false,error:'scanner_not_configured'});
});

test('scanner health is minimal when configured',async()=>{
  const r=await scanner.fetch(new Request('https://evidence-scanner.thebedesk.com/health'),env,{});
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{ok:true,scanner:'cloudmersive'});
});

test('scanner rejects an invalid signed envelope before provider access',async()=>{
  let providerCalled=false;
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{providerCalled=true;throw new Error('must not be reached')};
  try{
    const body=new TextEncoder().encode('%PDF-1.7\nexample');
    const r=await scanner.fetch(new Request('https://evidence-scanner.thebedesk.com/scan',{method:'POST',headers:{
      'content-type':'application/pdf','x-evidence-id':'11111111-2222-3333-4444-555555555555',
      'x-evidence-sha256':'a'.repeat(64),'x-evidence-signature':'b'.repeat(64)
    },body}),env,{});
    assert.equal(r.status,409); // SHA check precedes signature check.
    assert.equal(providerCalled,false);
    assert.equal(r.headers.has('x-evidence-scan-signature'),true);
  }finally{globalThis.fetch=original}
});

test('valid signed evidence reaches Cloudmersive adapter and returns a signed clean verdict',async()=>{
  const enc=new TextEncoder();
  const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const hmac=async(secret,value)=>{const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,enc.encode(value)))};
  const body=enc.encode('%PDF-1.7\nclean demo evidence');
  const sha=hex(await crypto.subtle.digest('SHA-256',body));
  const id='11111111-2222-3333-4444-555555555555';
  const sig=await hmac(env.EVIDENCE_SCAN_SECRET,`${id}:${sha}:${body.byteLength}`);
  let providerCalled=false;
  const original=globalThis.fetch;
  globalThis.fetch=async(url,opts)=>{
    providerCalled=true;
    assert.equal(url,'https://api.cloudmersive.com/virus/scan/file');
    assert.equal(opts.method,'POST');
    assert.equal(opts.headers.Apikey,env.CLOUDMERSIVE_API_KEY);
    assert.ok(opts.body instanceof FormData);
    assert.ok(opts.body.get('inputFile') instanceof Blob);
    return new Response(JSON.stringify({CleanResult:true,FoundViruses:[]}),{status:200,headers:{'content-type':'application/json'}});
  };
  try{
    const r=await scanner.fetch(new Request('https://evidence-scanner.thebedesk.com/scan',{method:'POST',headers:{
      'content-type':'application/pdf','x-evidence-id':id,'x-evidence-sha256':sha,'x-evidence-signature':sig
    },body}),env,{});
    assert.equal(r.status,200);
    const text=await r.text(),data=JSON.parse(text);
    assert.equal(providerCalled,true);
    assert.equal(data.verdict,'clean');
    assert.equal(data.evidenceId,id);
    assert.equal(data.sha256,sha);
    assert.equal(r.headers.get('x-evidence-scan-signature'),await hmac(env.EVIDENCE_SCAN_SECRET,text));
  }finally{globalThis.fetch=original}
});
