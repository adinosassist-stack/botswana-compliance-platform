import test from 'node:test';
import assert from 'node:assert/strict';
import {readMotsheloGroupSummary} from '../server/thebe-life/d1-motshelo-group-summary.mjs';
const sample={group_id:'g1',group_name:'Community Savings',group_model:'rotating',
  member_count:12,reported_minor:120000,matched_minor:110000,cleared_minor:100000};
function mock(row){
  const calls=[];
  return {calls,prepare(sql){
    const call={sql,values:null};calls.push(call);
    return {bind(...values){call.values=values;return {async first(){return row;}};}};
  }};
}
test('authorizes group membership inside the aggregate SQL and binds session identity',async()=>{
  const db=mock(sample);
  const value=await readMotsheloGroupSummary({db,groupId:'g1',sessionUserId:'u1'});
  assert.equal(value.ok,true);
  assert.equal(value.outstandingVerificationMinor,20000);
  assert.equal(value.bankVerified,false);
  assert.equal(value.availableToDisburseMinor,null);
  assert.equal(value.paymentExecutionEnabled,false);
  assert.match(db.calls[0].sql,/m.group_id=g.id AND m.user_id=\?2 AND m.status='active'/);
  assert.deepEqual(db.calls[0].values,['g1','u1']);
});
test('revoked and unrelated members receive no summary, not zero totals',async()=>{
  assert.deepEqual(await readMotsheloGroupSummary({db:mock(null),groupId:'g1',sessionUserId:'u2'}),
    {ok:false,reason:'not_authorized_or_not_found'});
});
test('legitimate groups with zero contributions return zero totals',async()=>{
  const value=await readMotsheloGroupSummary({db:mock({...sample,reported_minor:0,matched_minor:0,cleared_minor:0}),groupId:'g1',sessionUserId:'u1'});
  assert.equal(value.ok,true);
  assert.equal(value.outstandingVerificationMinor,0);
});
test('rejects forged IDs and corrupt aggregate amounts',async()=>{
  const db=mock(sample);
  await assert.rejects(readMotsheloGroupSummary({db,groupId:'g1',sessionUserId:'u1; DROP'}),/invalid_session_user_id/);
  assert.equal(db.calls.length,0);
  for(const bad of [{...sample,cleared_minor:110001},{...sample,reported_minor:-1},{...sample,matched_minor:1.5},{...sample,member_count:'12'},{...sample,group_id:'g2'}]){
    await assert.rejects(readMotsheloGroupSummary({db:mock(bad),groupId:'g1',sessionUserId:'u1'}),/invalid_/);
  }
});
