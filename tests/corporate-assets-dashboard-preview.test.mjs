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

test("counts actionable overdue maintenance but excludes retired asset statuses", () => {
  const assets = [
    {...asset,id:"due-active",status:"active",next_due_on:"2026-11-07"},
    {...asset,id:"due-maintenance",status:"maintenance",next_due_on:"2026-11-08"},
    {...asset,id:"due-written-off",status:"written_off",next_due_on:"2026-11-07"},
    {...asset,id:"due-decommissioned",status:"decommissioned",next_due_on:"2026-11-07"},
    {...asset,id:"future-active",status:"active",next_due_on:"2026-11-09"},
    {...asset,id:"unscheduled-active",status:"active",next_due_on:null}
  ];
  const before=JSON.stringify(assets);
  const result=previewAssetDashboard({...base,assets});
  assert.equal(result.assetCount,6);
  assert.equal(result.maintenanceDue,2);
  assert.equal(result.byStatus.written_off,1);
  assert.equal(result.byStatus.decommissioned,1);
  assert.equal(result.byStatus.active,3);
  assert.equal(JSON.stringify(assets),before,"summary must not modify original rows");
  assert.ok(Object.isFrozen(result.byStatus));
  assert.ok(Object.isFrozen(result.byCategory));
});

test("rejects malformed dates even for retired assets and disallows cross-tenant mixing", () => {
  assert.throws(()=>previewAssetDashboard({...base,assets:[
    {...asset,id:"retired-invalid",status:"written_off",next_due_on:"2026-02-30"}
  ]}),/invalid_due_date/);
  assert.throws(()=>previewAssetDashboard({...base,assets:[
    asset,{...asset,id:"other-tenant",tenant_id:"tenant-b",status:"decommissioned"}
  ]}),/invalid_asset/);
});
