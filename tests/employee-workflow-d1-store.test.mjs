import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEmployeeWorkflowD1Store } from '../cloudflare/src/employee-workflow-d1-store.js';

test('D1 save binds trusted scope', async () => {
 let params;
 const db={prepare(){return {bind(...values){params=values;return {async run(){return {success:true}}}}}}};
 const store=createEmployeeWorkflowD1Store(db);
 assert.equal(await store.saveOwned({tenantId:'t1',ownerId:'u1',workflow:{id:'w1'}}),true);
 assert.deepEqual(params.slice(0,3),['t1','u1','w1']);
});
test('D1 list binds tenant and owner',async()=>{
 let params;
 const db={prepare(){return {bind(...values){params=values;return {async all(){return {success:true,results:[]}}}}}}};
 const result=await createEmployeeWorkflowD1Store(db).listOwned({tenantId:'t1',ownerId:'u1'});
 assert.deepEqual(params,['t1','u1']);
 assert.deepEqual(result,[]);
});
test('D1 rejects missing tenant',async()=>{
 const store=createEmployeeWorkflowD1Store({prepare(){throw Error('should not access')}});
 await assert.rejects(store.listOwned({tenantId:'',ownerId:'u1'}));
});
