import test from 'node:test';
import assert from 'node:assert/strict';
import {recordTransfer,recordStatusChange} from '../server/corporate-assets-audit.mjs';
const companyId='123e4567-e89b-42d3-a456-426614174000',actorId='123e4567-e89b-42d3-a456-426614174001',assetId='123e4567-e89b-42d3-a456-426614174002';
const context={companyId,actorId,authorized:true};
test('transfer uses tenant and prior branch in optimistic update',async()=>{
 const calls=[];const db={query:async(sql,args)=>{calls.push({sql,args});return {rowCount:1}}};
 await recordTransfer({db,context,assetId,transfer:{fromBranch:'Gaborone',toBranch:'Maun',effectiveDate:'2026-11-01',reason:'Relocation'}});
 assert.equal(calls.length,2);assert.equal(calls[0].args[2],companyId);assert.equal(calls[0].args[3],'Gaborone');
 assert.equal(calls[1].args[0],companyId);
});
test('unauthorized context never queries',async()=>{
 let count=0;const db={query:async()=>{count++;return {rowCount:1}}};
 await assert.rejects(recordStatusChange({db,context:{...context,authorized:false},assetId,from:'Active',to:'Written Off',reason:'Retired'}),/unauthorized/);
 assert.equal(count,0);
});
test('stale state prevents event insert',async()=>{
 let count=0;const db={query:async()=>{count++;return {rowCount:0}}};
 await assert.rejects(recordStatusChange({db,context,assetId,from:'Active',to:'Written Off',reason:'Retired'}),/asset_conflict/);
 assert.equal(count,1);
});
