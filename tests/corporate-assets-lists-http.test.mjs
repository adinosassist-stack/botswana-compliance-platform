import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssetsListsHttp} from '../server/corporate-assets-lists-http.mjs';
const principal={companyId:'123e4567-e89b-42d3-a456-426614174000',userId:'123e4567-e89b-42d3-a456-426614174001'};
function handler(overrides={}){
 let queries=0;
 const defaults={authenticate:async()=>principal,authorize:async()=>true,rateLimit:async()=>true,getDatabase:async()=>({query:async()=>{queries++;return {rows:[]}}}),clock:()=>new Date('2026-11-01T10:00:00Z')};
 return {run:createAssetsListsHttp({...defaults,...overrides}),get queries(){return queries}};
}
test('asset register returns no-store tenant-scoped JSON',async()=>{
 const h=handler();const result=await h.run({method:'GET',path:'/api/assets'});
 assert.equal(result.status,200);assert.deepEqual(result.body,{assets:[]});assert.equal(result.headers['cache-control'],'no-store');assert.equal(h.queries,1);
});
test('maintenance and insurance endpoints return expected envelopes',async()=>{
 const h=handler();assert.deepEqual((await h.run({method:'GET',path:'/api/assets/maintenance'})).body,{events:[]});
 assert.deepEqual((await h.run({method:'GET',path:'/api/assets/insurance'})).body,{policies:[]});
});
test('denied authorization never accesses database',async()=>{
 let calls=0;const h=handler({authorize:async()=>false,getDatabase:async()=>{calls++;throw new Error('should not run')}});
 assert.equal((await h.run({method:'GET',path:'/api/assets'})).status,403);assert.equal(calls,0);
});
test('unauthenticated and invalid methods fail closed',async()=>{
 const h=handler({authenticate:async()=>null});
 assert.equal((await h.run({method:'GET',path:'/api/assets'})).status,401);
 assert.equal((await h.run({method:'POST',path:'/api/assets'})).status,405);
 assert.equal(h.queries,0);
});
test('rate limit fail closed',async()=>{
 const h=handler({rateLimit:async()=>false});assert.equal((await h.run({method:'GET',path:'/api/assets'})).status,429);assert.equal(h.queries,0);
});
