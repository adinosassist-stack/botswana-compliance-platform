import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SITE, ASSETLINKS, PACKAGE_NAME, normalizeFingerprint,
  hasVerifiedAssociation, fetchPublicAssetlinks
} from '../android/thebe-ai/scripts/audit-origin-assetlinks.mjs';

const fp = Array.from({length:32},(_,i)=>i.toString(16).padStart(2,'0')).join(':').toUpperCase();
const payload = (fingerprint=fp, pack=PACKAGE_NAME, relation='delegate_permission/common.handle_all_urls') => [{
  relation:[relation],
  target:{namespace:'android_app',package_name:pack,sha256_cert_fingerprints:[fingerprint]}
}];

test('origin is fixed to HTTPS and package binding is exact',()=>{
  assert.equal(SITE,'https://thebedesk.com');
  assert.equal(ASSETLINKS,'https://thebedesk.com/.well-known/assetlinks.json');
  assert.equal(PACKAGE_NAME,'com.thebedesk.ai');
  assert.equal(hasVerifiedAssociation(payload(),fp),true);
  assert.equal(hasVerifiedAssociation(payload(fp,'com.other.app'),fp),false);
  assert.equal(hasVerifiedAssociation(payload(fp,PACKAGE_NAME,'some.other.relation'),fp),false);
  assert.equal(hasVerifiedAssociation([{...payload()[0],target:{...payload()[0].target,namespace:'web'}}],fp),false);
  assert.equal(hasVerifiedAssociation(payload(fp), 'FF:'.repeat(31)+'FF'),false);
  assert.equal(hasVerifiedAssociation({value:payload()},fp),false);
});

test('only a well-formed nonzero SHA-256 signing certificate digest is accepted',()=>{
  assert.equal(normalizeFingerprint(fp),fp);
  assert.equal(normalizeFingerprint(fp.replaceAll(':','').toLowerCase()),fp);
  for(const bad of ['',null,'x','00'.repeat(32),'AA:BB','FF:'.repeat(32),'::'+fp,'G'.repeat(64)]){
    assert.equal(normalizeFingerprint(bad),null);
  }
});

test('public preflight fetch is read-only, origin-pinned and credential-free', async()=>{
  let checked=false;
  const data=await fetchPublicAssetlinks(async (url,options)=>{
    checked=true;
    assert.equal(url,ASSETLINKS);
    assert.equal(options.method,'GET');
    assert.equal(options.redirect,'manual');
    assert.equal(options.credentials,'omit');
    assert.equal(options.cache,'no-store');
    return new Response(JSON.stringify(payload()),{status:200,headers:{'content-type':'application/json'}});
  });
  assert.equal(checked,true);
  assert.equal(hasVerifiedAssociation(data,fp),true);
});

test('redirect, HTML login, 404, oversize, and non-array JSON always fail closed',async()=>{
  const cases=[
    new Response(null,{status:302,headers:{location:'https://thebedesk.com/auth/'}}),
    new Response('<html>Sign in</html>',{status:200,headers:{'content-type':'text/html'}}),
    new Response('not found',{status:404,headers:{'content-type':'application/json'}}),
    new Response(' '.repeat(65537),{status:200,headers:{'content-type':'application/json'}}),
    new Response('{"relation":[]}',{status:200,headers:{'content-type':'application/json'}})
  ];
  for(const response of cases){
    await assert.rejects(()=>fetchPublicAssetlinks(async()=>response));
  }
});

test('no release certificate fingerprint never proves trust',async()=>{
  // Only the pure matcher is tested here; do not invoke a live site from CI.
  assert.equal(hasVerifiedAssociation(payload(),undefined),false);
  assert.equal(hasVerifiedAssociation(payload(),'00'.repeat(32)),false);
  assert.equal(hasVerifiedAssociation(payload(fp.slice(0,-3)+'FFF'),fp),false);
});
