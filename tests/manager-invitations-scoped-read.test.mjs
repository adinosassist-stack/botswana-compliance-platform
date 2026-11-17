import test from 'node:test';
import assert from 'node:assert/strict';
import {createManagerScopedReadHttp} from '../cloudflare/src/manager-invitations-scoped-read.js';
const queries=[];const actor={tenantId:'tenant-a',userId:'manager-a',role:'manager'};
function handler(member=1){
 const db={prepare(sql){return{bind(...args){queries.push({sql,args});return{first:async()=>({ok:member}),all:async()=>({results:[]})};}}}};
 return createManagerScopedReadHttp({db});
}
const request=path=>new Request('https://staging.thebedesk.com'+path);
test('manager cannot access unknown paths or impersonate other workspace roles',async()=>{
 const h=handler(),size=queries.length;
 assert.equal((await h(request('/api/workspace/managers/other'),actor)).status,404);
 assert.equal((await h(request('/api/workspace/managers/my-reports'),{...actor,role:'owner'})).status,403);
 assert.equal(queries.length,size);
});
test('manager membership must still be active and invitation accepted',async()=>{
 assert.equal((await handler(0)(request('/api/workspace/managers/my-reports'),actor)).status,403);
});
test('location reads bind both tenant and user and active grant',async()=>{
 queries.length=0;
 const r=await handler()(request('/api/workspace/managers/my-locations'),actor);
 assert.equal(r.status,200);assert.deepEqual((await r.json()).locations,[]);
 const sql=queries[1].sql;
 assert.match(sql,/g\.tenant_id=\?/);assert.match(sql,/g\.manager_user_id=\?/);
 assert.match(sql,/g\.status='active'/);assert.match(sql,/l\.active=1/);
 assert.deepEqual(queries[1].args,['tenant-a','manager-a']);
});
test('report reads join tenant+location grants and never accept querystring scope',async()=>{
 queries.length=0;
 const r=await handler()(request('/api/workspace/managers/my-reports?tenantId=other&locationId=other'),actor);
 assert.equal(r.status,200);
 const q=queries[1];assert.match(q.sql,/g\.tenant_id=r\.tenant_id/);
 assert.match(q.sql,/g\.location_id=r\.location_id/);
 assert.match(q.sql,/r\.tenant_id=\?/);assert.match(q.sql,/LIMIT 50/);
 assert.deepEqual(q.args,['manager-a','tenant-a']);
});
