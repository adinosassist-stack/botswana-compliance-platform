import test from "node:test";
import assert from "node:assert/strict";
import {previewEssentialsJobProfit} from "../server/essentials-job-profit.mjs";
test("compares estimated and actual job profitability",()=>{
 const x=previewEssentialsJobProfit({tenantId:"tenant-a",projectId:"job-1",quotedRevenueThebe:100000,actualRevenueThebe:100000,estimatedCosts:{materials:20000,labour:10000},actualCosts:{materials:30000,labour:10000}});
 assert.equal(x.estimatedProfitThebe,70000);assert.equal(x.actualProfitThebe,60000);assert.equal(x.profitVarianceThebe,-10000);assert.equal(x.cashCollectedNotInferred,true);
});
test("rejects invalid costs",()=>{
 assert.throws(()=>previewEssentialsJobProfit({tenantId:"tenant-a",projectId:"job-1",quotedRevenueThebe:100,actualRevenueThebe:100,actualCosts:{materials:-1}}),/invalid_cost/);
});

test("rejects profit variance outside safe integer thebe range",()=>{
 const max=Number.MAX_SAFE_INTEGER;
 assert.throws(()=>previewEssentialsJobProfit({
  tenantId:"tenant-a",projectId:"job-1",
  quotedRevenueThebe:0,actualRevenueThebe:max,
  estimatedCosts:{materials:max},actualCosts:{materials:0}
 }),/amount_overflow/);
});
