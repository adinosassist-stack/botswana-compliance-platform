import test from "node:test";
import assert from "node:assert/strict";
import { previewJobCosting } from "../server/project-job-costing-preview.js";

const base = {tenantId:"tenant-a",projectId:"project-a",revenueThebe:100000};
test("calculates cost and profit without side effects", () => {
  const result = previewJobCosting({...base,materials:[{costThebe:25000}],labour:[{costThebe:15000}],subcontractors:[{costThebe:10000}],otherCosts:[{costThebe:5000}]});
  assert.equal(result.totalCostThebe,55000);
  assert.equal(result.profitThebe,45000);
  assert.equal(result.marginPercent,45);
  assert.equal(result.previewOnly,true);
  assert.equal(result.currency,"BWP");
  assert.ok(Object.isFrozen(result));
});
test("supports loss and zero-revenue preview", () => {
  assert.equal(previewJobCosting({...base,revenueThebe:0}).marginPercent,null);
  assert.equal(previewJobCosting({...base,materials:[{costThebe:120000}]}).profitThebe,-20000);
});
test("rejects malformed identities and monetary values", () => {
  for (const input of [
    {...base,tenantId:""}, {...base,projectId:null},
    {...base,revenueThebe:1.5}, {...base,revenueThebe:-1},
    {...base,materials:[{costThebe:NaN}]},
    {...base,materials:[{costThebe:1.5}]},
    {...base,materials:[{costThebe:-1}]},
    {...base,materials:[null]},
    {...base,materials:"bad"}
  ]) assert.throws(() => previewJobCosting(input));
});
test("rejects overflow and unbounded arrays", () => {
  assert.throws(() => previewJobCosting({...base,materials:[{costThebe:Number.MAX_SAFE_INTEGER},{costThebe:1}]}), /amount_overflow/);
  assert.throws(() => previewJobCosting({...base,materials:Array.from({length:1001},()=>({costThebe:1}))}));
});
