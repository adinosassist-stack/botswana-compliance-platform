import test from "node:test";
import assert from "node:assert/strict";
import {corporateAssetsSummary} from "../server/corporate-assets-summary.js";
const assets=[{id:"a",current_book_value_bwp:"100.29"},{id:"b",current_book_value_bwp:"22.10"}];
test("reports infographics in BWP without floating-point drift",()=>{
 const result=corporateAssetsSummary(assets,[{asset_id:"a",next_due_date:"2026-11-01"}],[{asset_id:"b",coverage_end:"2026-11-10"}],"2026-11-01");
 assert.deepEqual(result,{totalAssets:2,bookValueBwp:122.39,maintenanceDue:1,insuranceDue:0});
 assert.equal(Object.isFrozen(result),true);
});
test("rejects duplicate assets and negative values",()=>{
 assert.throws(()=>corporateAssetsSummary([assets[0],assets[0]]),/invalid_asset_rows/);
 assert.throws(()=>corporateAssetsSummary([{id:"x",current_book_value_bwp:-1}]),/invalid_book_value/);
});
test("rejects out-of-scope reminder rows instead of leaking another tenant's events",()=>{
 assert.throws(()=>corporateAssetsSummary(assets,[{asset_id:"other",next_due_date:"2026-10-01"}]),/unscoped_asset_event/);
});
