import test from 'node:test';
import assert from 'node:assert/strict';
import {listMaintenance} from '../server/corporate-assets-maintenance-reader.mjs';
const companyId='123e4567-e89b-42d3-a456-426614174000';
const context={companyId,authorized:true};
test('unfiltered maintenance remains compatible',async()=>{
 let observed;
 const db={query:async(sql,params)=>{observed={sql,params};return {rows:[{asset_name:'Van',description:'Service',service_date:'2026-11-01',cost_bwp:'100.00'}]}}};
 const result=await listMaintenance({db,context});
 assert.deepEqual(observed.params,[companyId,50]);
 assert.match(observed.sql,/WHERE m.company_id=\$1 ORDER BY m.service_date DESC,m.id DESC LIMIT \$2$/);
 assert.equal(result.events[0].costBwp,100);
});
test('date-range filters remain parameterized and tenant-scoped',async()=>{
 let observed;
 const db={query:async(sql,params)=>{observed={sql,params};return {rows:[]}}};
 await listMaintenance({db,context,fromDate:'2026-01-01',toDate:'2026-12-31',limit:20});
 assert.match(observed.sql,/WHERE m.company_id=\$1 AND m.service_date >= \$2 AND m.service_date <= \$3/);
 assert.match(observed.sql,/LIMIT \$4$/);
 assert.deepEqual(observed.params,[companyId,'2026-01-01','2026-12-31',20]);
});
test('invalid and reversed dates fail before querying',async()=>{
 let calls=0;const db={query:async()=>{calls++;return {rows:[]}}};
 for(const options of [{fromDate:'2026-02-30'},{toDate:'2026-13-01'},{fromDate:'2026-12-01',toDate:'2026-01-01'},{fromDate:'2026-01-01 OR TRUE'},{fromDate:''},{fromDate:null}]){
  await assert.rejects(listMaintenance({db,context,...options}),/invalid_date_range/);
 }
 await assert.rejects(listMaintenance({db,context:{companyId,authorized:false},fromDate:'2026-01-01'}),/unauthorized/);
 assert.equal(calls,0);
});
test('valid leap date and single boundary work',async()=>{
 let observed;const db={query:async(sql,params)=>{observed={sql,params};return {rows:[]}}};
 await listMaintenance({db,context,toDate:'2028-02-29'});
 assert.deepEqual(observed.params,[companyId,'2028-02-29',50]);
});
