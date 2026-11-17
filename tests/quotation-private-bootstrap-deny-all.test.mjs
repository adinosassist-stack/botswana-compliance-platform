import test from 'node:test';
import assert from 'node:assert/strict';
import bootstrap from '../server/quotation-private-bootstrap-deny-all.mjs';

test('deny-all bootstrap returns 404 on every method and path', async()=>{
  for(const method of ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']){
    for(const path of ['/','/rehearsal/synthetic','/api/quotation/drafts',
      '/api/quotation/logo/pdf-preview','/health']){
      const request=new Request('https://example.invalid'+path,{
        method,headers:{'cookie':'synthetic-demo-cookie',
          'origin':'https://example.invalid',
          'x-csrf-token':'synthetic-demo-csrf'},
        ...(method==='GET'||method==='HEAD'?{}:{body:'synthetic-data'})
      });
      const response=await bootstrap.fetch(request,Object.freeze({
        AUTH_DB:Object.freeze({prepare(){throw Error('D1_ACCESS_NOT_ALLOWED');}}),
        privateBucket:Object.freeze({get(){throw Error('R2_ACCESS_NOT_ALLOWED');}})
      }));
      assert.equal(response.status,404,method+' '+path);
      assert.equal(response.headers.get('cache-control'),'private, no-store');
      assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
      assert.equal(response.headers.get('location'),null);
      assert.equal(response.headers.get('access-control-allow-origin'),null);
      assert.equal(await response.text(),'Not Found');
    }
  }
});

test('deny-all bootstrap ignores environment flags and never invokes injected bindings',async()=>{
 let calls=0;
 const env={
   QUOTATION_PRIVATE_REHEARSAL_ENABLED:'synthetic-internal-only',
   QUOTATION_PRIVATE_REHEARSAL_ENVIRONMENT:'quotation-private-staging',
   AUTH_DB:{prepare(){calls++;throw Error('no auth');}},
   BUCKET:{get(){calls++;throw Error('no storage');}},
 };
 const r=await bootstrap.fetch(new Request(
   'https://anything.invalid/rehearsal/synthetic',
   {headers:{'x-quotation-private-caller':'any'}}),env);
 assert.equal(r.status,404);
 assert.equal(calls,0);
});
