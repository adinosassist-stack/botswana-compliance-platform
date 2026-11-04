import test from 'node:test';
import assert from 'node:assert/strict';
import {listInsurance} from '../server/corporate-assets-insurance-reader.mjs';
const companyId='123e4567-e89b-42d3-a456-426614174000',context={companyId,authorized:true};
test('insurance renewal summary counts only displayed tenant-scoped policies',async()=>{
 let observed;
 const db={query:async(sql,params)=>{observed={sql,params};return {rows:[
 {asset_name:'A',provider:'Insurer',end_date:'2026-10-31'},
 {asset_name:'B',provider:'Insurer',end_date:'2026-11-10'},
 {asset_name:'C',provider:'Insurer',end_date:'2027-05-03'}
 ]}}};
 const result=await listInsurance({db,context,asOfDate:'2026-11-03'});
 assert.match(observed.sql,/p.company_id=\$1/);
 assert.deepEqual(observed.params,[companyId,50]);
 assert.deepEqual(result.summary,{shown:3,expired:1,due:1,current:1});
 assert.deepEqual(result.policies.map(x=>x.state),['expired','due','current']);
});
test('configurable warning window changes classification but not data scope',async()=>{
 const db={query:async()=>({rows:[{asset_name:'A',provider:'Insurer',end_date:'2026-11-20'}]})};
 const result=await listInsurance({db,context,asOfDate:'2026-11-03',warningDays:7});
 assert.equal(result.policies[0].state,'current');
 assert.equal(result.summary.current,1);
});
test('invalid dates, warning windows and unauthorized access fail before query',async()=>{
 let calls=0;const db={query:async()=>{calls++;return {rows:[]}}};
 for(const options of [{asOfDate:'2026-02-30'},{asOfDate:'bad'},{asOfDate:'2026-11-03',warningDays:-1},{asOfDate:'2026-11-03',warningDays:366},{asOfDate:'2026-11-03',warningDays:'30'}]){
  await assert.rejects(listInsurance({db,context,...options}));
 }
 await assert.rejects(listInsurance({db,context:{companyId,authorized:false},asOfDate:'2026-11-03'}),/unauthorized/);
 assert.equal(calls,0);
});
