import test from "node:test";
import assert from "node:assert/strict";
import { previewCrmPipeline } from "../server/crm-pipeline-preview.js";

test("summarizes tenant-scoped sales opportunities", () => {
  const result = previewCrmPipeline({tenantId:"tenant-a",leads:[
    {id:"a",tenantId:"tenant-a",stage:"new",valueThebe:10000},
    {id:"b",tenantId:"tenant-a",stage:"won",valueThebe:25000}
  ]});
  assert.equal(result.totalLeads,2);
  assert.equal(result.totalValueThebe,35000);
  assert.equal(result.byStage.won.count,1);
  assert.equal(result.byStage.new.valueThebe,10000);
  assert.equal(result.previewOnly,true);
  assert.ok(Object.isFrozen(result.byStage.won));
});
test("rejects cross-tenant rows and malformed stages", () => {
  for(const lead of [
    {id:"a",tenantId:"tenant-b",stage:"new",valueThebe:100},
    {id:"a",tenantId:"tenant-a",stage:"unknown",valueThebe:100},
    {id:"a",tenantId:"tenant-a",stage:"new",valueThebe:-1},
    {id:"a",tenantId:"tenant-a",stage:"new",valueThebe:0.1}
  ]) assert.throws(()=>previewCrmPipeline({tenantId:"tenant-a",leads:[lead]}));
});
test("rejects overflowing totals",()=>{
  assert.throws(()=>previewCrmPipeline({tenantId:"tenant-a",leads:[
    {id:"a",tenantId:"tenant-a",stage:"new",valueThebe:Number.MAX_SAFE_INTEGER},
    {id:"b",tenantId:"tenant-a",stage:"won",valueThebe:1}
  ]}),/amount_overflow/);
});

test("rejects duplicate opportunity identifiers without modifying input",()=>{
  const lead={id:"same",tenantId:"tenant-a",stage:"qualified",valueThebe:150};
  const leads=[lead,{...lead,stage:"proposal"}];
  const before=JSON.stringify(leads);
  assert.throws(()=>previewCrmPipeline({tenantId:"tenant-a",leads}),/invalid_lead/);
  assert.equal(JSON.stringify(leads),before);
});
