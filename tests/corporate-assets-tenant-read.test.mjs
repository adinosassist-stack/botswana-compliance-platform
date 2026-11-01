import test from 'node:test';
import assert from 'node:assert/strict';
import {withAssetTenantRead,createAssetTenantDatabase} from '../server/corporate-assets-tenant-read.mjs';
const tenant='11111111-1111-4111-8111-111111111111';
function pool({failOn}={}){
 const calls=[];let releases=0;
 return {calls,get releases(){return releases},async connect(){return {async query(sql,params){calls.push({sql,params});if(sql===failOn)throw new Error('db_failed');return {rows:[]}},release(){releases++}}}};
}
test('read transaction binds tenant with LOCAL setting and commits',async()=>{
 const p=pool();
 const result=await withAssetTenantRead(p,tenant,db=>db.query('SELECT 1',[]));
 assert.deepEqual(result,{rows:[]});
 assert.deepEqual(p.calls.map(c=>c.sql),['BEGIN READ ONLY',"SELECT set_config('app.current_tenant_id',$1,true)",'SELECT 1','COMMIT']);
 assert.deepEqual(p.calls[1].params,[tenant]);assert.equal(p.releases,1);
});
test('read transaction rolls back and releases on query error',async()=>{
 const p=pool({failOn:'SELECT 1'});
 await assert.rejects(()=>withAssetTenantRead(p,tenant,db=>db.query('SELECT 1',[])),/db_failed/);
 assert.equal(p.calls.at(-1).sql,'ROLLBACK');assert.equal(p.releases,1);
});
test('invalid tenant cannot acquire connection',async()=>{
 const p=pool();await assert.rejects(()=>withAssetTenantRead(p,'attacker',()=>{}),/invalid_tenant_read/);
 assert.equal(p.calls.length,0);
});
test('database factory obtains a fresh scoped transaction for each query',async()=>{
 const p=pool();const getDatabase=createAssetTenantDatabase(p);
 const db=await getDatabase({companyId:tenant});
 await db.query('SELECT 1',[]);await db.query('SELECT 2',[]);
 assert.equal(p.releases,2);
 assert.equal(p.calls.filter(c=>c.sql==='BEGIN READ ONLY').length,2);
});

test('tenant context failure rolls back before any asset query',async()=>{
 const p=pool({failOn:"SELECT set_config('app.current_tenant_id',$1,true)"});
 await assert.rejects(()=>withAssetTenantRead(p,tenant,db=>db.query('SELECT sensitive_assets',[])),/db_failed/);
 assert.deepEqual(p.calls.map(c=>c.sql),['BEGIN READ ONLY',"SELECT set_config('app.current_tenant_id',$1,true)",'ROLLBACK']);
 assert.equal(p.releases,1);
});
test('sequential tenant reads set distinct local contexts',async()=>{
 const other='33333333-3333-4333-8333-333333333333';
 const p=pool();
 await withAssetTenantRead(p,tenant,db=>db.query('SELECT 1',[]));
 await withAssetTenantRead(p,other,db=>db.query('SELECT 1',[]));
 const settings=p.calls.filter(c=>c.sql.includes('set_config'));
 assert.deepEqual(settings.map(c=>c.params[0]),[tenant,other]);
 assert.equal(p.releases,2);
});
