import test from 'node:test';
import assert from 'node:assert/strict';
import {probeCorporateAssetsRls} from '../server/corporate-assets-rls-probe.mjs';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
function fixture({leak=false,force=true,bypass=false,empty=false}={}){
 let tenant;
 const pool={async connect(){return {async query(sql,params){
  if(sql.includes('set_config')){tenant=params[0];return {rows:[]}}
  if(sql.includes('current_user'))return {rows:[{role:'staging_runtime',row_security:'on'}]};
  if(sql.includes('pg_roles'))return {rows:[{rolsuper:false,rolbypassrls:bypass}]};
  if(sql.includes('pg_tables'))return {rows:['corporate_assets','asset_maintenance_logs','asset_insurance_policies'].map(tablename=>({tablename,rowsecurity:true,forcerowsecurity:force}))};
  if(sql.includes('GROUP BY'))return {rows:empty?[]:[{company_id:leak?tenant===a?b:a:tenant,count:1}]};
  return {rows:[]};
 },release(){}}}};
 return pool;
}
test('staging probe qualifies forced RLS and isolated fixture tenants',async()=>{
 const result=await probeCorporateAssetsRls({pool:fixture(),tenantA:a,tenantB:b});
 assert.equal(result.qualified,true);
 assert.equal(result.a.visibleTenants,1);
});
test('staging probe rejects cross-tenant visibility',async()=>{
 assert.equal((await probeCorporateAssetsRls({pool:fixture({leak:true}),tenantA:a,tenantB:b})).qualified,false);
});
test('staging probe rejects missing FORCE RLS',async()=>{
 assert.equal((await probeCorporateAssetsRls({pool:fixture({force:false}),tenantA:a,tenantB:b})).qualified,false);
});
test('staging probe rejects same tenant twice',async()=>{
 await assert.rejects(()=>probeCorporateAssetsRls({pool:fixture(),tenantA:a,tenantB:a}),/invalid_rls_probe/);
});

test('staging probe rejects RLS-bypass database roles',async()=>{
 assert.equal((await probeCorporateAssetsRls({pool:fixture({bypass:true}),tenantA:a,tenantB:b})).qualified,false);
});
test('staging probe rejects empty fixture visibility instead of false success',async()=>{
 assert.equal((await probeCorporateAssetsRls({pool:fixture({empty:true}),tenantA:a,tenantB:b})).qualified,false);
});
