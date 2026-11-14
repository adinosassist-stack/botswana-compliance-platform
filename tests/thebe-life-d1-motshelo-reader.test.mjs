import test from 'node:test';
import assert from 'node:assert/strict';
import {readMotsheloContributions} from '../server/thebe-life/d1-motshelo-reader.mjs';
const row={id:'c1',member_user_id:'member1',due_on:'2026-11-10',
  reported_minor:15000,matched_minor:10000,cleared_minor:5000,currency:'BWP'};
function db(rows){
  const calls=[];
  return {calls,prepare(sql){
    const call={sql,params:null};calls.push(call);
    return {bind(...params){call.params=params;return {async all(){return {results:rows};}};}};
  }};
}
test('scopes contribution query to active same-group membership in SQL',async()=>{
  const storage=db([row]);
  const result=await readMotsheloContributions({db:storage,groupId:'group1',sessionUserId:'user1',limit:5});
  assert.equal(result.records[0].reportedMinor,15000);
  assert.equal(result.records[0].clearedMinor,5000);
  assert.equal(result.records[0].bankVerified,false);
  assert.equal(result.paymentExecutionEnabled,false);
  assert.match(storage.calls[0].sql,/m.group_id=c.group_id AND m.user_id=\?2 AND m.status='active'/);
  assert.deepEqual(storage.calls[0].params,['group1','user1',5]);
});
test('does not expose contribution data after membership is revoked',async()=>{
  const storage=db([]);
  const result=await readMotsheloContributions({db:storage,groupId:'group1',sessionUserId:'user1'});
  assert.deepEqual(result.records,[]);
  assert.equal(result.truncated,false);
});
test('rejects forged identities and invalid limits before reading',async()=>{
  const storage=db([row]);
  await assert.rejects(readMotsheloContributions({db:storage,groupId:'group1',sessionUserId:'a;drop'}),/invalid_session_user_id/);
  await assert.rejects(readMotsheloContributions({db:storage,groupId:'group1',sessionUserId:'u1',limit:101}),/invalid_limit/);
  assert.equal(storage.calls.length,0);
});
test('fails closed on corrupt contribution progression or currencies',async()=>{
  for(const invalid of [{...row,cleared_minor:11000},{...row,currency:'USD'},{...row,reported_minor:-1}]){
    await assert.rejects(readMotsheloContributions({db:db([invalid]),groupId:'group1',sessionUserId:'user1'}),/invalid_contribution_row/);
  }
});
