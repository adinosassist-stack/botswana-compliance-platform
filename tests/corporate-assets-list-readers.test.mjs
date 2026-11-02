import test from 'node:test';
import assert from 'node:assert/strict';
import {listMaintenance} from '../server/corporate-assets-maintenance-reader.mjs';
import {listAssetRegister} from '../server/corporate-assets-register-reader.mjs';
const companyId='123e4567-e89b-42d3-a456-426614174000',context={companyId,authorized:true};
test('asset register maps SQL fields and scopes company',async()=>{
 const db={query:async(sql,params)=>{assert.match(sql,/WHERE company_id=\$1/);assert.equal(params[0],companyId);return {rows:[{id:'a',asset_name:'Truck',asset_category:'Fleet',assigned_branch:'Maun',status:'Active',current_book_value_bwp:'25000.00'}]}}};
 const r=await listAssetRegister({db,context});assert.equal(r.assets[0].bookValueBwp,25000);assert.equal(r.assets[0].name,'Truck');
});
test('maintenance list uses schema names and maps amounts',async()=>{
 const db={query:async(sql,params)=>{assert.match(sql,/a.asset_name/);assert.match(sql,/m.cost_bwp/);assert.equal(params[0],companyId);return {rows:[{asset_name:'Truck',description:'Oil change',service_date:'2026-11-01',cost_bwp:'350.00'}]}}};
 const r=await listMaintenance({db,context});assert.equal(r.events[0].costBwp,350);assert.equal(r.events[0].serviceDate,'2026-11-01');
});
test('both readers reject unauthenticated calls before querying',async()=>{
 let calls=0;const db={query:async()=>{calls++;return {rows:[]}}};
 await assert.rejects(listMaintenance({db,context:{companyId,authorized:false}}),/unauthorized/);
 await assert.rejects(listAssetRegister({db,context:{companyId,authorized:false}}),/unauthorized/);
 assert.equal(calls,0);
});
