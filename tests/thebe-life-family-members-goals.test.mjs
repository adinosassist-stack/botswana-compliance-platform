import test from 'node:test';
import assert from 'node:assert/strict';
import {readFamilyMembers} from '../server/thebe-life/d1-family-members.mjs';
import {planFamilyGoal} from '../server/thebe-life/family-goal-planner.mjs';
function dbReturning(rows){
 const calls=[];
 return {calls,prepare(sql){const call={sql,args:[]};calls.push(call);
   return {bind(...args){call.args=args;return {async all(){return {results:rows};}};}};}};
}
test('only active owner receives members with authorization in roster SQL',async()=>{
 const db=dbReturning([{user_id:'u1',role:'owner',status:'active'},{user_id:'u2',role:'adult',status:'invited'}]);
 const output=await readFamilyMembers({db,householdId:'h1',sessionUserId:'u1'});
 assert.equal(output.ok,true);assert.equal(output.members.length,2);
 assert.deepEqual(db.calls[0].args,['h1','u1']);
 assert.match(db.calls[0].sql,/requester.user_id=\?2/);
 assert.match(db.calls[0].sql,/requester.role='owner' AND requester.status='active'/);
 assert.match(db.calls[0].sql,/LIMIT 101/);
});
test('denies empty/unrelated households and revoked owner even on mocked DB leak',async()=>{
 const none=dbReturning([]);
 assert.deepEqual(await readFamilyMembers({db:none,householdId:'h1',sessionUserId:'u1'}),
 {ok:false,reason:'not_authorized_or_empty'});
 const leaked=dbReturning([{user_id:'u1',role:'owner',status:'revoked'},{user_id:'u2',role:'adult',status:'active'}]);
 assert.equal((await readFamilyMembers({db:leaked,householdId:'h1',sessionUserId:'u1'})).ok,false);
});
test('refuses forged user IDs and malformed/oversized rosters',async()=>{
 const malformed=dbReturning([{user_id:'u1',role:'admin',status:'active'}]);
 await assert.rejects(readFamilyMembers({db:malformed,householdId:'h1',sessionUserId:'bad id'}),/invalid_session_user_id/);
 await assert.rejects(readFamilyMembers({db:malformed,householdId:'h1',sessionUserId:'u1'}),/invalid_member_row/);
 const oversized=dbReturning(Array.from({length:101},(_,i)=>({user_id:'u'+i,role:'owner',status:'active'})));
 await assert.rejects(readFamilyMembers({db:oversized,householdId:'h1',sessionUserId:'u1'}),/roster_limit_exceeded/);
});
test('family savings plan calculates exact Pula minor units and never assumes bank money',()=>{
 assert.deepEqual(planFamilyGoal({name:'School Fees',targetMinor:600000,savedMinor:320000,monthlyMinor:70000,startMonth:'2026-11'}),
 {name:'School Fees',currency:'BWP',targetMinor:600000,savedMinor:320000,monthlyMinor:70000,
 remainingMinor:280000,monthsNeeded:4,achievedMonth:'2027-02',bankVerified:false,automaticTransfersEnabled:false});
});
test('zero remaining goal and year rollover are deterministic',()=>{
 assert.equal(planFamilyGoal({name:'Emergency',targetMinor:1000,savedMinor:1000,monthlyMinor:200,startMonth:'2026-12'}).achievedMonth,'2026-12');
 assert.equal(planFamilyGoal({name:'Emergency',targetMinor:300,savedMinor:0,monthlyMinor:100,startMonth:'2026-12'}).achievedMonth,'2027-02');
});
test('goal inputs fail closed on negative numbers and unsafe arithmetic',()=>{
 for(const changes of [{targetMinor:-1},{targetMinor:0},{monthlyMinor:0},{savedMinor:9000},{startMonth:'2026-13'},{monthlyMinor:1.25}]){
  assert.throws(()=>planFamilyGoal({name:'School',targetMinor:1000,savedMinor:200,monthlyMinor:100,startMonth:'2026-11',...changes}));
 }
});
