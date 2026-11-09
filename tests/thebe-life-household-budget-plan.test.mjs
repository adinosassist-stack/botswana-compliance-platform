import test from 'node:test';
import assert from 'node:assert/strict';
import {planHouseholdBudget} from '../server/thebe-life/household-budget-plan.mjs';

test('plans envelopes without double-counting commitments as spent money',()=>{
  const r=planHouseholdBudget({incomeMinor:200000,commitmentsMinor:30000,envelopes:[
    {id:'food',plannedMinor:50000,spentMinor:35000},
    {id:'transport',plannedMinor:20000,spentMinor:25000}
  ]});
  assert.equal(r.allocatedMinor,70000);
  assert.equal(r.spentMinor,60000);
  assert.equal(r.unallocatedMinor,100000);
  assert.equal(r.cashPlanRemainingMinor,110000);
  assert.equal(r.categories[1].overBudget,true);
  assert.equal(r.bankVerified,false);
  assert.equal(r.paymentsEnabled,false);
});

test('overallocated plan is visible but does not claim insufficient bank funds',()=>{
  const r=planHouseholdBudget({incomeMinor:10000,commitmentsMinor:5000,envelopes:[{id:'rent',plannedMinor:8000}]});
  assert.equal(r.unallocatedMinor,-3000);
  assert.equal(r.overAllocated,true);
  assert.equal(r.planningOnly,true);
});

test('fails closed for negative, fractional, unsafe or duplicate values',()=>{
  assert.throws(()=>planHouseholdBudget({incomeMinor:-1}),/invalid_income/);
  assert.throws(()=>planHouseholdBudget({incomeMinor:2.5}),/invalid_income/);
  assert.throws(()=>planHouseholdBudget({incomeMinor:100,envelopes:[{id:'food',plannedMinor:2},{id:'food',plannedMinor:3}]}),/duplicate/);
  assert.throws(()=>planHouseholdBudget({incomeMinor:100,envelopes:[{id:'x',plannedMinor:-1}]}),/invalid_planned/);
  assert.throws(()=>planHouseholdBudget({incomeMinor:Number.MAX_SAFE_INTEGER,commitmentsMinor:1}),/overflow/);
  assert.throws(()=>planHouseholdBudget({incomeMinor:10,envelopes:[{id:'x',plannedMinor:10,spentMinor:11.1}]}),/invalid_spent/);
});

test('outputs frozen snapshots and never enables money movement',()=>{
  const r=planHouseholdBudget({incomeMinor:0});
  assert.equal(Object.isFrozen(r),true);
  assert.equal(Object.isFrozen(r.categories),true);
  assert.equal(r.cashPlanRemainingMinor,0);
});
