import test from 'node:test';
import assert from 'node:assert/strict';
import {withAssetTransaction,transferAsset} from '../server/corporate-assets-transaction.mjs';
const companyId='123e4567-e89b-42d3-a456-426614174000',actorId='123e4567-e89b-42d3-a456-426614174001',assetId='123e4567-e89b-42d3-a456-426614174002';
function fakePool(failAt){const calls=[];let released=0;return {calls,get released(){return released},connect:async()=>({query:async(sql)=>{calls.push(sql);if(sql.startsWith(failAt||'__never__'))throw new Error('simulated_failure');return {rowCount:1}},release:()=>released++})}}
test('commit follows both asset update and audit insert',async()=>{
 const pool=fakePool();
 await transferAsset(pool,{context:{companyId,actorId,authorized:true},assetId,transfer:{fromBranch:'Maun',toBranch:'Palapye',effectiveDate:'2026-11-01',reason:'Assignment'}});
 assert.equal(pool.calls[0],'BEGIN');assert.match(pool.calls[1],/^UPDATE/);assert.match(pool.calls[2],/^INSERT/);
 assert.equal(pool.calls[3],'COMMIT');assert.equal(pool.released,1);
});
test('audit failure rolls back asset update',async()=>{
 const pool=fakePool('INSERT');
 await assert.rejects(transferAsset(pool,{context:{companyId,actorId,authorized:true},assetId,transfer:{fromBranch:'Maun',toBranch:'Palapye',effectiveDate:'2026-11-01',reason:'Assignment'}}),/simulated_failure/);
 assert.equal(pool.calls.at(-1),'ROLLBACK');assert.equal(pool.calls.includes('COMMIT'),false);assert.equal(pool.released,1);
});
test('operation error releases connection and rolls back',async()=>{
 const pool=fakePool();
 await assert.rejects(withAssetTransaction(pool,async()=>{throw new Error('rejected')}),/rejected/);
 assert.deepEqual(pool.calls,['BEGIN','ROLLBACK']);assert.equal(pool.released,1);
});
