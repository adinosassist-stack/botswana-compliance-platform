import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateMotsheloDisbursement} from '../server/thebe-life/motshelo-governance.mjs';

const request={id:'p1',groupId:'g1',requestedBy:'owner',amountMinor:10000};
const vote=(reviewerId,decision='approve')=>({
  requestId:'p1',groupId:'g1',reviewerId,reviewerRole:'chair',memberActive:true,decision
});

test('active committee rejection blocks even with two other approvals',()=>{
  const r=evaluateMotsheloDisbursement({request,approvals:[vote('a'),vote('b'),vote('c','reject')],verifiedClearedMinor:20000});
  assert.deepEqual(r,{eligible:false,reason:'committee_rejection_requires_new_review'});
});
test('rejection cannot be undone by adding a later approval in the same review cycle',()=>{
  const r=evaluateMotsheloDisbursement({request,approvals:[vote('a','reject'),vote('a'),vote('b')],verifiedClearedMinor:20000});
  assert.equal(r.eligible,false);
});
test('unrelated-group rejection does not veto this request',()=>{
  const unrelated={...vote('c','reject'),groupId:'other'};
  const r=evaluateMotsheloDisbursement({request,approvals:[vote('a'),vote('b'),unrelated],verifiedClearedMinor:20000});
  assert.equal(r.reason,'review_qualified_only_no_execution');
});
