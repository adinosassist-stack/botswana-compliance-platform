import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeJobCosting} from '../server/batch-b-job-costing.mjs';
test('calculates integer-thebe profit and margin', () => {
  const r = summarizeJobCosting({revenueThebe:10000,costs:[{category:'materials',amountThebe:2500},{category:'labour',amountThebe:1500}]});
  assert.equal(r.totalCostThebe,4000);
  assert.equal(r.profitThebe,6000);
  assert.equal(r.marginBasisPoints,6000);
  assert.equal(r.categories.materials,2500);
});
test('zero revenue has no defined margin',()=>assert.equal(summarizeJobCosting({revenueThebe:0,costs:[]}).marginBasisPoints,null));
test('rejects negative, fractional and unsafe amounts',()=>{
  for(const amountThebe of [-1,1.2,Number.MAX_SAFE_INTEGER+1])
    assert.throws(()=>summarizeJobCosting({revenueThebe:100,costs:[{category:'labour',amountThebe}]}));
});
test('rejects cost overflow',()=>assert.throws(()=>summarizeJobCosting({revenueThebe:100,costs:[{category:'a',amountThebe:Number.MAX_SAFE_INTEGER},{category:'a',amountThebe:1}]}),/amount_overflow/));
test('rejects malformed categories and inputs',()=>{
  assert.throws(()=>summarizeJobCosting(null));
  assert.throws(()=>summarizeJobCosting({revenueThebe:10,costs:[{category:'__proto__',amountThebe:1}]}));
});
