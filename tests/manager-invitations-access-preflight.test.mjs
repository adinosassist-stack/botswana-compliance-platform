import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeStagingTarget,assertAccessBoundary,qualifyPrivateAccess} from '../scripts/manager-staging-access-preflight.mjs';
const team='private-team.cloudflareaccess.com';
const valid={status:302,location:'https://'+team+'/cdn-cgi/access/login/example'};
test('only HTTPS staging origins and pinned Cloudflare Access team host accepted',()=>{
 assert.deepEqual(normalizeStagingTarget('https://staging.test.invalid/',team),{origin:'https://staging.test.invalid',accessDomain:team});
 for(const bad of ['http://staging.test.invalid','https://user@staging.test.invalid','https://staging.test.invalid/path','https://example.com/'])
  assert.throws(()=>normalizeStagingTarget(bad,team));
 for(const bad of ['staging.test.invalid','login.cloudflareaccess.com.evil.com','https://'+team,''])
  assert.throws(()=>normalizeStagingTarget('https://staging.test.invalid/',bad));
});
test('app-origin 401, 403, 404 and 200 never satisfy Access isolation',()=>{
 for(const status of [200,301,401,403,404,500])
  assert.throws(()=>assertAccessBoundary({...valid,status,accessDomain:team}));
 for(const location of ['https://thebedesk.com/cdn-cgi/access/login','http://'+team+'/cdn-cgi/access/login','https://'+team+'.evil.invalid/cdn-cgi/access/login','https://'+team+'/other/login'])
  assert.throws(()=>assertAccessBoundary({...valid,location,accessDomain:team}));
 assert.equal(assertAccessBoundary({...valid,accessDomain:team}),true);
});
test('preflight tests every protected path without cookies and fails on first bypass',async()=>{
 const paths=[];const fetchFn=async(url,opts)=>{
  paths.push({path:new URL(url).pathname,opts});
  return {status:302,headers:new Headers({location:valid.location})};
 };
 const result=await qualifyPrivateAccess({origin:'https://private-staging.test.invalid/',accessDomain:team,fetchFn});
 assert.equal(result.ok,true);
 assert.equal(result.checked.length,7);
 assert.ok(paths.some(x=>x.path==='/api/auth/me'));
 assert.ok(paths.some(x=>x.path==='/manager-invite/activate/'));
 assert.ok(paths.every(x=>x.opts.redirect==='manual'&&x.opts.credentials==='omit'&&x.opts.method==='GET'));
 let attempts=0;
 await assert.rejects(()=>qualifyPrivateAccess({origin:'https://private-staging.test.invalid/',accessDomain:team,fetchFn:async()=>{
  attempts++;return {status:404,headers:new Headers()};
 }}));
 assert.equal(attempts,1);
});
test('qualification does not send invite tokens or trigger synthetic mutations',()=>{
 const code=fs.readFileSync(new URL('../scripts/manager-staging-access-preflight.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(code,/fetchFn\([^)]*\{method:'POST'/);
 assert.doesNotMatch(code,/authorization:\s*['"]/i);
 assert.match(code,/credentials:'omit'/);
});
