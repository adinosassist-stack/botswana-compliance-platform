import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssetsNodeHttpHandler} from '../server/corporate-assets-node-http.mjs';
function response(){return {writeHead(status,headers){this.status=status;this.headers=headers},end(body){this.body=JSON.parse(body)}}}
test('required security headers cannot be overridden by adapter',async()=>{
 const handler=createAssetsNodeHttpHandler({featureEnabled:async()=>true,handle:async()=>({status:200,body:{assets:[]},headers:{'cache-control':'public','x-content-type-options':'none'}})});
 const res=response();
 await handler({url:'/api/assets',method:'GET'},res);
 assert.equal(res.status,200);
 assert.equal(res.headers['cache-control'],'no-store');
 assert.equal(res.headers['x-content-type-options'],'nosniff');
});
test('feature disabled does not call asset handler',async()=>{
 let calls=0;
 const handler=createAssetsNodeHttpHandler({featureEnabled:async()=>false,handle:async()=>{calls++;return {status:200,body:{}}}});
 const res=response();
 await handler({url:'/api/assets',method:'GET'},res);
 assert.equal(res.status,404);
 assert.equal(calls,0);
});
