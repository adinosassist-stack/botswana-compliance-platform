import test from "node:test";
import assert from "node:assert/strict";
import { previewAssetDashboard } from "../cloudflare/src/corporate-assets-dashboard-preview.js";
const base = {tenantId:"tenant-a",asOfDate:"2026-11-08"};
const asset = {id:"asset-a",tenant_id:"tenant-a",category:"fleet",status:"active",
  acquisition_cost_minor:200000,book_value_minor:150000,next_due_on:"2026-11-08"};
test("aggregates assets, categories and maintenance due", () => {
  const r=previewAssetDashboard({...base,assets:[asset]});
  assert.equal(r.assetCount,1);
  assert.equal(r.bookValueMinor,150000);
  assert.equal(r.maintenanceDue,1);
  assert.equal(r.byCategory.fleet,1);
  assert.equal(r.byStatus.active,1);
  assert.equal(r.previewOnly,true);
  assert.ok(Object.isFrozen(r));
});
test("rejects cross-tenant, duplicate and invalid monetary rows", () => {
  for (const assets of [[{...asset,tenant_id:"tenant-b"}],[asset,asset],
    [{...asset,book_value_minor:-1}],[{...asset,acquisition_cost_minor:1.5}],
    [{...asset,next_due_on:"2026-02-30"}]]) {
    assert.throws(()=>previewAssetDashboard({...base,assets}));
  }
});
test("rejects invalid dates and overflows", () => {
  assert.throws(()=>previewAssetDashboard({...base,asOfDate:"2026-02-30",assets:[]}));
  assert.throws(()=>previewAssetDashboard({...base,assets:[
    {...asset,acquisition_cost_minor:Number.MAX_SAFE_INTEGER},
    {...asset,id:"asset-b",acquisition_cost_minor:1}
  ]}),/amount_overflow/);
});
