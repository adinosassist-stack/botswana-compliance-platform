import test from 'node:test';
import assert from 'node:assert/strict';
import {readFamilyBudgetSummary} from '../server/thebe-life/d1-family-budget-summary.mjs';
function dbReturning(row){
 const calls=[];
 return {calls,prepare(sql){
  const call={sql,params:null};calls.push(call);
  return {bind(...args){call.params=args;return {async first(){return row;}};}};
 }};
}
const args={householdId:'family1',sessionUserId:'owner1',month:'2026-11'};
test('family summary returns income, expenses and commitments without bank verification',async()=>{
 const db=dbReturning({income_minor:200000,expense_minor:50000,commitment_minor:30000,entry_count:5});
 const result=await readFamilyBudgetSummary({db,...args});
 assert.deepEqual(result,{ok:true,householdId:'family1',month:'2026-11',currency:'BWP',
  incomeMinor:200000,expenseMinor:50000,commitmentMinor:30000,remainingMinor:120000,entryCount:5,bankVerified:false});
 assert.deepEqual(db.calls[0].params,['family1','owner1','2026-11-01','2026-12-01']);
 assert.match(db.calls[0].sql,/m.household_id=\?1 AND m.user_id=\?2/);
 assert.match(db.calls[0].sql,/m.status='active'/);
 assert.match(db.calls[0].sql,/m.role IN \('owner','adult','viewer'\)/);
 assert.match(db.calls[0].sql,/e.type IN \('income','expense','commitment'\)/);
 assert.doesNotMatch(db.calls[0].sql,/transfer_in|transfer_out/);
});
test('denies users without active family membership without leaking aggregates',async()=>{
 const db=dbReturning(null);
 assert.deepEqual(await readFamilyBudgetSummary({db,...args}),{ok:false,reason:'not_authorized'});
});
test('handles year boundary and zero entries safely',async()=>{
 const db=dbReturning({income_minor:0,expense_minor:0,commitment_minor:0,entry_count:0});
 const result=await readFamilyBudgetSummary({db,...args,month:'2026-12'});
 assert.equal(result.remainingMinor,0);
 assert.deepEqual(db.calls[0].params,['family1','owner1','2026-12-01','2027-01-01']);
});
test('rejects forged identity, malformed months and unsafe stored totals',async()=>{
 const db=dbReturning({income_minor:-1,expense_minor:0,commitment_minor:0,entry_count:0});
 await assert.rejects(readFamilyBudgetSummary({db,...args,sessionUserId:'user;DROP'}),/invalid_session_user_id/);
 await assert.rejects(readFamilyBudgetSummary({db,...args,month:'2026-13'}),/invalid_month/);
 await assert.rejects(readFamilyBudgetSummary({db,...args}),/invalid_family_budget_total_income_minor/);
});
test('does not return an imprecise remaining amount on overflow',async()=>{
 const db=dbReturning({income_minor:0,expense_minor:Number.MAX_SAFE_INTEGER,commitment_minor:1,entry_count:2});
 await assert.rejects(readFamilyBudgetSummary({db,...args}),/family_budget_balance_out_of_range/);
});
