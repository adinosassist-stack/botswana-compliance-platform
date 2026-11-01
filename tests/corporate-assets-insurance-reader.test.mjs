import test from 'node:test';
import assert from 'node:assert/strict';
import {listInsurance} from '../server/corporate-assets-insurance-reader.mjs';
const companyId='123e4567-e89b-42d3-a456-426614174000';
test('insurance query enforces tenant and classifies expiry',async()=>{
 let args;const db={query:async(sql,params)=>{assert.match(sql,/p.company_id=\$1/);args=params;return {rows:[{asset_name:'Truck',provider:'Insurer',end_date:'2026-11-01'}]}}};
 const result=await listInsurance({db,context:{companyId,authorized:true},asOfDate:'2026-11-01'});
 assert.equal(args[0],companyId);assert.equal(result.policies[0].state,'due');
});
test('unauthorized requests never query',async()=>{
 let calls=0;const db={query:async()=>{calls++;return {rows:[]}}};
 await assert.rejects(listInsurance({db,context:{companyId,authorized:false},asOfDate:'2026-11-01'}),/unauthorized/);
 assert.equal(calls,0);
});

test('insurance reader rejects invalid date returned by database',async()=>{
 const db={query:async()=>({rows:[{asset_name:'Truck',provider:'Insurer',end_date:'invalid'}]})};
 await assert.rejects(listInsurance({db,context:{companyId,authorized:true},asOfDate:'2026-11-01'}),/invalid_policy_date/);
});
