import test from 'node:test';
import assert from 'node:assert/strict';
import {householdSummary, motsheloProjection, insuranceCommissionIllustration} from '../server/thebe-life/finance-core.mjs';
test('household keeps earmarked motshelo commitments distinct from expenses', () => {
  assert.deepEqual(householdSummary({income:[2000000], expenses:[1180000], commitments:[100000]}), {
    incomeMinor:2000000, expensesMinor:1180000, commitmentsMinor:100000,
    remainingMinor:720000, overBudget:false
  });
});
test('household does not conceal overspend', () => {
  assert.equal(householdSummary({income:[100], expenses:[101]}).overBudget, true);
});
test('motshelo projected funds are not verified settlement', () => {
  const result=motsheloProjection({members:12,contributionMinor:100000,cycles:12,receivedMembers:10});
  assert.equal(result.monthlyExpectedMinor,1200000);
  assert.equal(result.outstandingMinor,200000);
  assert.equal(result.plannedContributionsMinor,14400000);
  assert.equal(result.verifiedAvailableMinor,null);
});
test('rejects invalid groups and unsafe arithmetic', () => {
  assert.throws(()=>motsheloProjection({members:0,contributionMinor:100,cycles:12}));
  assert.throws(()=>motsheloProjection({members:2,contributionMinor:100,cycles:2,receivedMembers:3}));
  assert.throws(()=>motsheloProjection({members:10000,contributionMinor:Number.MAX_SAFE_INTEGER,cycles:2}));
});
test('insurance projection is not recognized revenue', () => {
  assert.deepEqual(insuranceCommissionIllustration({premiumMinor:25000,assumedRateBasisPoints:1000,qualifyingPolicies:100}),{
    illustrativeCommissionMinor:250000,earnedMinor:null,payableMinor:null
  });
});
