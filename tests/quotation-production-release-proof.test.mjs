import test from 'node:test';
import assert from 'node:assert/strict';
import {auditQuotationProduction,ORIGIN,QUOTE_ASSET} from '../scripts/quotation-production-release-proof.mjs';

const sha='a'.repeat(40);
const manifest={schema:1,release:'production',sequence:644,sourceSha:sha};
const asset=Buffer.from('synthetic local quotation asset used only for test fixtures'.repeat(4));
const version={ok:true,release:'production',releaseSequence:644,sourceSha:sha,
  runtimeEntry:'release-governance-entry'};

function responder({versionBody=version,assetBody=asset,previewStatus=404,readyStatus=404,
                   assetStatus=200,versionStatus=200}={}){
 const requests=[];
 const fetchImpl=async(url,options)=>{
  requests.push({url,options});
  const path=new URL(url).pathname;
  if(path==='/api/version')return new Response(JSON.stringify(versionBody),
    {status:versionStatus,headers:{'content-type':'application/json'}});
  if(path===QUOTE_ASSET)return new Response(assetBody,{status:assetStatus});
  if(path==='/app/quotations/preview/')return new Response('',{status:previewStatus});
  if(path==='/app/quotations/customer-ready/')return new Response('',{status:readyStatus});
  throw Error('unexpected URL');
 };
 return {fetchImpl,requests};
}

test('exact live source and guest denial qualifies without sending cookies or writes',async()=>{
 const s=responder();
 const r=await auditQuotationProduction({manifest,localAsset:asset,fetchImpl:s.fetchImpl});
 assert.equal(r.ok,true);
 assert.equal(r.checks.length,4);
 assert.equal(r.checks[1].result,'exact_asset_match');
 assert.equal(r.checks[2].result,'anonymous_denied');
 assert.equal(r.checks[3].result,'anonymous_denied');
 assert.equal(r.capabilities.production_change,false);
 for(const {url,options} of s.requests){
  assert.ok(url.startsWith(ORIGIN+'/'));
  assert.equal(options.method,'GET');
  assert.equal(options.credentials,'omit');
  assert.equal(options.redirect,'error');
  assert.ok(!Object.keys(options.headers).some(n=>/cookie|authorization/i.test(n)));
 }
});

test('reject demo preview or customer-ready HTTP 200, even if only sample data',async()=>{
 for(const setting of [{previewStatus:200},{readyStatus:200}]){
  const s=responder(setting);
  const r=await auditQuotationProduction({manifest,localAsset:asset,fetchImpl:s.fetchImpl});
  assert.equal(r.ok,false);
  assert.ok(r.checks.some(x=>x.result==='anonymous_access_gate_failed'));
 }
});

test('reject served asset mismatch, even when old JS contains print fallback',async()=>{
 const s=responder({assetBody:Buffer.from('stale production module body')});
 const r=await auditQuotationProduction({manifest,localAsset:asset,fetchImpl:s.fetchImpl});
 assert.equal(r.ok,false);
 assert.equal(r.checks[1].result,'asset_mismatch_or_unavailable');
 assert.notEqual(r.checks[1].servedSha256,r.expectedAssetSha256);
});

test('reject stale release SHA, wrong manifest sequence, wrong route status',async()=>{
 for(const versionBody of [{...version,sourceSha:'b'.repeat(40)},
                           {...version,releaseSequence:643}])
 {
  const s=responder({versionBody});
  const r=await auditQuotationProduction({manifest,localAsset:asset,fetchImpl:s.fetchImpl});
  assert.equal(r.ok,false);
  assert.equal(r.checks[0].result,'mismatch_or_unavailable');
 }
 const s=responder({readyStatus:302});
 assert.equal((await auditQuotationProduction({manifest,localAsset:asset,fetchImpl:s.fetchImpl})).ok,false);
});

test('fail closed on malformed manifests, unexpected origin and unsafe asset',async()=>{
 const s=responder();
 for(const m of [{...manifest,sourceSha:'short'}, {...manifest,sequence:0}, {...manifest,schema:2}]){
  await assert.rejects(auditQuotationProduction({manifest:m,localAsset:asset,fetchImpl:s.fetchImpl}),/invalid_exact_release_manifest/);
 }
 await assert.rejects(auditQuotationProduction({manifest,localAsset:asset,origin:'https://example.org',fetchImpl:s.fetchImpl}),/production_origin_must_be_exact/);
 await assert.rejects(auditQuotationProduction({manifest,localAsset:Buffer.from(''),fetchImpl:s.fetchImpl}),/invalid_local_quotation_asset/);
 assert.equal(s.requests.length,0);
});

test('network or HTTP failures cannot claim launch readiness',async()=>{
 const s=responder({assetStatus:404});
 assert.equal((await auditQuotationProduction({manifest,localAsset:asset,fetchImpl:s.fetchImpl})).ok,false);
 const r=await auditQuotationProduction({manifest,localAsset:asset,fetchImpl:async()=>{throw Error('offline')}});
 assert.equal(r.ok,false);
 assert.equal(r.checks.length,4);
 assert.ok(r.checks.every(x=>x.result==='unavailable'));
});
