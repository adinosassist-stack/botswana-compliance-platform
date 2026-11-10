import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {recordHouseholdEntry} from '../server/thebe-life/d1-household-writer.mjs';
import {readHouseholdEntries} from '../server/thebe-life/d1-household-reader.mjs';
import {readFamilyBudgetSummary} from '../server/thebe-life/d1-family-budget-summary.mjs';
import {readFamilyMembers} from '../server/thebe-life/d1-family-members.mjs';

// A local, in-memory SQLite fixture. Never accesses Cloudflare, payments or personal data.
// D1's bind(...params) maps to numbered parameters; node:sqlite binds them by key.
function fixture(){
 const sql=readFileSync(new URL('../docs/sql/thebe-life-d1-proposal.sql',import.meta.url),'utf8');
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('PRAGMA foreign_keys=ON');
 sqlite.exec(sql);
 const db={prepare(query){
  const stmt=sqlite.prepare(query);
  return {bind(...values){
   const params=Object.fromEntries(values.map((value,i)=>[String(i+1),value]));
   return {
    async first(){return stmt.get(params)??null;},
    async all(){return {results:stmt.all(params)};},
    async run(){const receipt=stmt.run(params);return {meta:{changes:Number(receipt.changes)}};}
   };
  }};
 }};
 function seed(){
  const addHouse=sqlite.prepare('INSERT INTO life_households (id,display_name,created_by) VALUES (?1,?2,?3)');
  addHouse.run({'1':'familyA','2':'Family A','3':'alice'});
  addHouse.run({'1':'familyB','2':'Family B','3':'bob'});
  const addMember=sqlite.prepare('INSERT INTO life_household_members (household_id,user_id,role,status) VALUES (?1,?2,?3,?4)');
  for(const [house,user,role,status] of [
   ['familyA','alice','owner','active'],
   ['familyA','adultA','adult','active'],
   ['familyA','viewerA','viewer','active'],
   ['familyA','invitedA','adult','invited'],
   ['familyB','bob','owner','active'],
   ['familyB','adultB','adult','active']
  ])addMember.run({'1':house,'2':user,'3':role,'4':status});
 }
 seed();
 return {sqlite,db,close(){sqlite.close();}};
}
const entry=(id,type,amountMinor)=>({id,type,category:'Family plan',amountMinor,currency:'BWP',occurredOn:'2026-11-09'});
test('real SQLite: owner/adult writes, outsider and invited denied, duplicate idempotent',async()=>{
 const x=fixture();try{
  assert.deepEqual(await recordHouseholdEntry({db:x.db,householdId:'familyA',sessionUserId:'alice',entry:entry('e1','income',50000)}),
   {created:true,reason:'recorded_not_bank_verified'});
  assert.equal((await recordHouseholdEntry({db:x.db,householdId:'familyA',sessionUserId:'adultA',entry:entry('e2','expense',12000)})).created,true);
  assert.equal((await recordHouseholdEntry({db:x.db,householdId:'familyA',sessionUserId:'viewerA',entry:entry('e3','expense',1000)})).created,false);
  assert.equal((await recordHouseholdEntry({db:x.db,householdId:'familyA',sessionUserId:'invitedA',entry:entry('e4','expense',1000)})).created,false);
  assert.equal((await recordHouseholdEntry({db:x.db,householdId:'familyA',sessionUserId:'bob',entry:entry('e5','expense',1000)})).created,false);
  assert.equal((await recordHouseholdEntry({db:x.db,householdId:'familyA',sessionUserId:'alice',entry:entry('e1','income',50000)})).created,false);
  assert.equal(x.sqlite.prepare('SELECT COUNT(*) AS n FROM life_household_entries').get().n,2);
 }finally{x.close();}
});
test('real SQLite: cross-household reads, revoked membership, and owner-only roster',async()=>{
 const x=fixture();try{
  await recordHouseholdEntry({db:x.db,householdId:'familyA',sessionUserId:'alice',entry:entry('expenseA','expense',3500)});
  assert.equal((await readHouseholdEntries({db:x.db,householdId:'familyA',userId:'bob'})).ok,false);
  assert.equal((await readFamilyBudgetSummary({db:x.db,householdId:'familyA',sessionUserId:'bob',month:'2026-11'})).ok,false);
  assert.equal((await readFamilyMembers({db:x.db,householdId:'familyA',sessionUserId:'adultA'})).ok,false);
  assert.equal((await readFamilyMembers({db:x.db,householdId:'familyA',sessionUserId:'alice'})).members.length,4);
  x.sqlite.prepare("UPDATE life_household_members SET status='revoked' WHERE household_id='familyA' AND user_id='alice'").run();
  assert.equal((await readHouseholdEntries({db:x.db,householdId:'familyA',userId:'alice'})).ok,false);
  assert.equal((await readFamilyBudgetSummary({db:x.db,householdId:'familyA',sessionUserId:'alice',month:'2026-11'})).ok,false);
  assert.equal((await readFamilyMembers({db:x.db,householdId:'familyA',sessionUserId:'alice'})).ok,false);
  assert.equal((await recordHouseholdEntry({db:x.db,householdId:'familyA',sessionUserId:'alice',entry:entry('e2','expense',300)})).created,false);
 }finally{x.close();}
});
test('real SQLite: monthly totals distinguish commitments and exclude transfer pairs',async()=>{
 const x=fixture();try{
  for(const [id,type,value] of [['income','income',200000],['expense','expense',40000],['commitment','commitment',25000]]){
   await recordHouseholdEntry({db:x.db,householdId:'familyA',sessionUserId:'alice',entry:entry(id,type,value)});
  }
  for(const [id,type] of [['transfer-in','transfer_in'],['transfer-out','transfer_out']]){
   const t={...entry(id,type,5000),transferId:'pair1'};
   assert.equal((await recordHouseholdEntry({db:x.db,householdId:'familyA',sessionUserId:'alice',entry:t})).created,true);
  }
  const summary=await readFamilyBudgetSummary({db:x.db,householdId:'familyA',sessionUserId:'viewerA',month:'2026-11'});
  assert.equal(summary.ok,true);assert.equal(summary.incomeMinor,200000);
  assert.equal(summary.expenseMinor,40000);assert.equal(summary.commitmentMinor,25000);
  assert.equal(summary.remainingMinor,135000);assert.equal(summary.entryCount,3);
  assert.equal(summary.bankVerified,false);
  assert.equal((await readFamilyBudgetSummary({db:x.db,householdId:'familyA',sessionUserId:'viewerA',month:'2026-12'})).entryCount,0);
 }finally{x.close();}
});
test('real SQLite: schema enforces foreign keys, valid roles and duplicate IDs',async()=>{
 const x=fixture();try{
  assert.throws(()=>x.sqlite.prepare("INSERT INTO life_household_members VALUES ('nonexistent','x','adult','active')").run());
  assert.throws(()=>x.sqlite.prepare("INSERT INTO life_household_members VALUES ('familyA','x','admin','active')").run());
  await recordHouseholdEntry({db:x.db,householdId:'familyA',sessionUserId:'alice',entry:entry('e1','expense',100)});
  assert.throws(()=>x.sqlite.prepare("INSERT INTO life_household_entries (household_id,id,type,category,amount_minor,currency,occurred_on,created_by) VALUES ('familyA','e1','expense','x',10,'BWP','2026-11-09','alice')").run());
 }finally{x.close();}
});
