import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileMotsheloReports} from '../server/thebe-life/motshelo-reconciliation.mjs';

const report=(id,memberId,reportedMinor,matchedMinor=0,clearedMinor=0)=>({
  id,memberId,groupId:'group1',reportedMinor,matchedMinor,clearedMinor
});

test('groups per-member reported, matched and cleared amounts without marking funds available',()=>{
  const result=reconcileMotsheloReports({groupId:'group1',expectedMinor:40000,reports:[
    report('a','m1',10000,10000,8000),report('b','m1',5000,5000,5000),
    report('c','m2',10000,0,0)
  ]});
  assert.equal(result.reportedMinor,25000);
  assert.equal(result.matchedMinor,15000);
  assert.equal(result.clearedMinor,13000);
  assert.equal(result.outstandingVerificationMinor,12000);
  assert.equal(result.reportingDifferenceMinor,15000);
  assert.deepEqual(result.members[0],{memberId:'m1',reportedMinor:15000,clearedMinor:13000,outstandingVerificationMinor:2000});
  assert.equal(result.fundsAvailableToDisburse,false);
  assert.equal(result.paymentExecutionEnabled,false);
  assert.equal(Object.isFrozen(result.members),true);
});

test('refuses cross-group, duplicate and malformed report identifiers',()=>{
  assert.throws(()=>reconcileMotsheloReports({groupId:'group1',expectedMinor:0,reports:[
    {...report('a','m1',1),groupId:'group2'}]}),/invalid_or_duplicate_report/);
  assert.throws(()=>reconcileMotsheloReports({groupId:'group1',expectedMinor:0,reports:[
    report('a','m1',1),report('a','m2',1)]}),/invalid_or_duplicate_report/);
  assert.throws(()=>reconcileMotsheloReports({groupId:'../../bad',expectedMinor:0}),/invalid_group_id/);
});

test('rejects impossible verification progression and overflow',()=>{
  assert.throws(()=>reconcileMotsheloReports({groupId:'group1',expectedMinor:0,reports:[
    report('a','m1',100,101,0)]}),/invalid_verification_progression/);
  assert.throws(()=>reconcileMotsheloReports({groupId:'group1',expectedMinor:0,reports:[
    report('a','m1',100,100,101)]}),/invalid_verification_progression/);
  assert.throws(()=>reconcileMotsheloReports({groupId:'group1',expectedMinor:0,reports:[
    report('a','m1',Number.MAX_SAFE_INTEGER),report('b','m2',1)]}),/reconciliation_overflow/);
  assert.throws(()=>reconcileMotsheloReports({groupId:'group1',expectedMinor:0,reports:[report('a','m1',-1)]}),/invalid_reported/);
});

test('zero reports do not imply money settled',()=>{
  const result=reconcileMotsheloReports({groupId:'group1',expectedMinor:1200000});
  assert.equal(result.reportedMinor,0);
  assert.equal(result.clearedMinor,0);
  assert.equal(result.outstandingVerificationMinor,0);
  assert.equal(result.verificationSource,'external_trusted_records_required');
});
