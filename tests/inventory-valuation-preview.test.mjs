import test from "node:test";
import assert from "node:assert/strict";
import {previewInventory} from "../server/inventory-valuation-preview.js";

const item={tenantId:"tenant-a",sku:"sku-1",quantity:3,reorderPoint:2,unitCostThebe:150,unitPriceThebe:250};

test("summarizes stock and retail value with integer thebe",()=>{
 const result=previewInventory({tenantId:"tenant-a",items:[item]});
 assert.equal(result.skuCount,1);
 assert.equal(result.stockValueThebe,450);
 assert.equal(result.retailValueThebe,750);
 assert.equal(result.lowStockCount,0);
 assert.equal(result.previewOnly,true);
 assert.ok(Object.isFrozen(result));
});

test("flags depleted and threshold stock",()=>{
 const result=previewInventory({tenantId:"tenant-a",items:[
  {...item,sku:"empty",quantity:0},{...item,sku:"threshold",quantity:2}
 ]});
 assert.equal(result.lowStockCount,2);
});

test("rejects cross-tenant rows, duplicate SKUs, malformed quantities and amounts",()=>{
 for(const items of [
  [{...item,tenantId:"tenant-b"}],
  [item,{...item}],
  [{...item,quantity:-1}],
  [{...item,unitCostThebe:1.1}],
  [{...item,unitPriceThebe:Number.MAX_SAFE_INTEGER+1}]
 ])assert.throws(()=>previewInventory({tenantId:"tenant-a",items}));
});

test("rejects value multiplication overflow and preserves original input",()=>{
 const items=[{...item,unitCostThebe:Number.MAX_SAFE_INTEGER,quantity:2}];
 const snapshot=JSON.stringify(items);
 assert.throws(()=>previewInventory({tenantId:"tenant-a",items}),/amount_overflow/);
 assert.equal(JSON.stringify(items),snapshot);
});
