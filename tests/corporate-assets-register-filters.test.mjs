import test from 'node:test';
import assert from 'node:assert/strict';
import {listAssetRegister} from '../server/corporate-assets-register-reader.mjs';
const companyId='123e4567-e89b-42d3-a456-426614174000';
const context={companyId,authorized:true};
test('filters by branch, category and status using bound parameters',async()=>{
 const calls=[];
 const db={query:async(sql,params)=>{calls.push({sql,params});return {rows:[]}}};
 await listAssetRegister({db,context,limit:25,filters:{branch:'Maun',category:'Fleet',status:'Active'}});
 assert.equal(calls.length,1);
 assert.match(calls[0].sql,/WHERE company_id=\$1 AND asset_category=\$2 AND assigned_branch=\$3 AND status=\$4/);
 assert.match(calls[0].sql,/LIMIT \$5$/);
 assert.deepEqual(calls[0].params,[companyId,'Fleet','Maun','Active',25]);
});
test('default query remains compatible with existing callers',async()=>{
 let observed;
 const db={query:async(sql,params)=>{observed={sql,params};return {rows:[]}}};
 assert.deepEqual(await listAssetRegister({db,context}),{assets:[]});
 assert.deepEqual(observed.params,[companyId,50]);
 assert.match(observed.sql,/WHERE company_id=\$1 ORDER BY created_at DESC,id DESC LIMIT \$2$/);
});
test('SQL-looking input remains a data parameter',async()=>{
 const value="Fleet' OR 1=1 --";
 let observed;
 const db={query:async(sql,params)=>{observed={sql,params};return {rows:[]}}};
 await listAssetRegister({db,context,filters:{category:value}});
 assert.equal(observed.sql.includes(value),false);
 assert.equal(observed.params[1],value);
});
test('invalid filters and unauthorized callers fail without database access',async()=>{
 let called=0;
 const db={query:async()=>{called++;return {rows:[]}}};
 for(const filters of [{branch:''},{branch:' Maun'},{status:'x'.repeat(81)},{status:'Active\nUnsafe'},{companyId},{category:42},null,[]]){
  await assert.rejects(listAssetRegister({db,context,filters}),/invalid_/);
 }
 await assert.rejects(listAssetRegister({db,context:{companyId,authorized:false},filters:{branch:'Maun'}}),/unauthorized/);
 assert.equal(called,0);
});
