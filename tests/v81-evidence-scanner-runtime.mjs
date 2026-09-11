import test from 'node:test';
import assert from 'node:assert/strict';
import scanner,{__scannerTest} from '../cloudflare/scanner/worker.js';

const env={EVIDENCE_SCAN_SECRET:'s'.repeat(48),CLOUDMERSIVE_API_KEY:'k'.repeat(32),MAX_SCAN_BYTES:'3500000'};
const enc=new TextEncoder();
const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
const hmac=async(secret,value)=>{const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,enc.encode(value)))};

async function signedHeaders(body,id='11111111-2222-3333-4444-555555555555'){
  const sha=hex(await crypto.subtle.digest('SHA-256',body)),size=String(body.byteLength),timestamp=String(Date.now()),requestId=crypto.randomUUID(),mime='application/pdf';
  const sig=await hmac(env.EVIDENCE_SCAN_SECRET,__scannerTest.scanRequestSignatureBase({evidenceId:id,claimedSha:sha,claimedSize:size,timestamp,requestId,mime}));
  return {id,sha,size,timestamp,requestId,mime,sig};
}

test('scanner health fails closed when secrets are absent',async()=>{
  const r=await scanner.fetch(new Request('https://evidence-scanner.thebedesk.com/health'),{},{});
  assert.equal(r.status,503);assert.deepEqual(await r.json(),{ok:false,error:'scanner_not_configured'});
});

test('scanner health is minimal when configured',async()=>{
  const r=await scanner.fetch(new Request('https://evidence-scanner.thebedesk.com/health'),env,{});
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,scanner:'cloudmersive'});
});

test('scanner rejects an invalid signature before body read or provider access',async()=>{
  let providerCalled=false,bodyRead=false;const original=globalThis.fetch;globalThis.fetch=async()=>{providerCalled=true;throw new Error('must not be reached')};
  try{
    const body=enc.encode('%PDF-1.7\nexample'),meta=await signedHeaders(body);
    const req={url:'https://evidence-scanner.thebedesk.com/scan',method:'POST',headers:new Headers({'content-type':meta.mime,'content-length':meta.size,'x-evidence-id':meta.id,'x-evidence-sha256':meta.sha,'x-evidence-size':meta.size,'x-evidence-timestamp':meta.timestamp,'x-evidence-request-id':meta.requestId,'x-evidence-signature':'b'.repeat(64)}),async arrayBuffer(){bodyRead=true;return body.buffer}};
    const r=await scanner.fetch(req,env,{});assert.equal(r.status,401);assert.equal((await r.json()).error,'signature_invalid');assert.equal(bodyRead,false);assert.equal(providerCalled,false);assert.equal(r.headers.has('x-evidence-scan-signature'),true);
  }finally{globalThis.fetch=original}
});

test('valid signed evidence reaches Cloudmersive adapter and returns a signed clean verdict',async()=>{
  const body=enc.encode('%PDF-1.7\nclean demo evidence'),meta=await signedHeaders(body);let providerCalled=false;const original=globalThis.fetch;
  globalThis.fetch=async(url,opts)=>{providerCalled=true;assert.equal(url,'https://api.cloudmersive.com/virus/scan/file');assert.equal(opts.method,'POST');assert.equal(opts.headers.Apikey,env.CLOUDMERSIVE_API_KEY);assert.ok(opts.body instanceof FormData);assert.ok(opts.body.get('inputFile') instanceof Blob);return new Response(JSON.stringify({CleanResult:true,FoundViruses:[]}),{status:200,headers:{'content-type':'application/json'}})};
  try{
    const r=await scanner.fetch(new Request('https://evidence-scanner.thebedesk.com/scan',{method:'POST',headers:{'content-type':meta.mime,'content-length':meta.size,'x-evidence-id':meta.id,'x-evidence-sha256':meta.sha,'x-evidence-size':meta.size,'x-evidence-timestamp':meta.timestamp,'x-evidence-request-id':meta.requestId,'x-evidence-signature':meta.sig},body}),env,{});
    assert.equal(r.status,200);const text=await r.text(),data=JSON.parse(text);assert.equal(providerCalled,true);assert.equal(data.verdict,'clean');assert.equal(data.evidenceId,meta.id);assert.equal(data.sha256,meta.sha);assert.equal(r.headers.get('x-evidence-scan-signature'),await hmac(env.EVIDENCE_SCAN_SECRET,text));
  }finally{globalThis.fetch=original}
});
