import test from "node:test";
import assert from "node:assert/strict";
import {corporateAssetService,depreciationEstimate} from "../server/corporate-assets-service.js";
const companyId="11111111-1111-4111-8111-111111111111",userId="22222222-2222-4222-8222-222222222222",assetId="33333333-3333-4333-8333-333333333333";
const identity={companyId,userId};
function fake(){const calls=[];return {calls,query:async(sql,params)=>{calls.push({sql,params});return {rows:[{id:assetId}]}}}}
test("rejects untrusted identities and identifiers",async()=>{
 const db=fake(),api=corporateAssetService(db);
 await assert.rejects(api.listAssets({companyId:"bad",userId}),/unauthorized/);
 await assert.rejects(api.getAsset(identity,"not-id"),/invalid_id/);
 assert.equal(db.calls.length,0);
});
test("asset inserts use company-scoped parameterized SQL",async()=>{
 const db=fake(),api=corporateAssetService(db);
 await api.createAsset(identity,{assetName:"Generator",category:"Machinery",branch:"Palapye",acquisitionDate:"2026-01-02",acquisitionCostBwp:3000,bookValueBwp:2700});
 assert.match(db.calls[0].sql,/company_id,asset_name/);
 assert.match(db.calls[0].sql,/\$10/);
 assert.equal(db.calls[0].params[0],companyId);
 assert.equal(db.calls[0].params[1],"Generator");
});
test("invalid financial input cannot reach DB",async()=>{
 const db=fake(),api=corporateAssetService(db);
 await assert.rejects(api.createAsset(identity,{assetName:"x",category:"Machinery",branch:"Gaborone",acquisitionDate:"2026-01-02",acquisitionCostBwp:-1,bookValueBwp:2}),/invalid_amount/);
 assert.equal(db.calls.length,0);
});
test("maintenance and insurance require valid dates",async()=>{
 const db=fake(),api=corporateAssetService(db);
 await assert.rejects(api.recordMaintenance(identity,assetId,{serviceType:"Repair",description:"Fixed",serviceDate:"2026-06-12",nextDueDate:"2026-06-11"}),/invalid_date/);
 await assert.rejects(api.addInsurance(identity,assetId,{insurer:"A",policyNumber:"X",coverageStart:"2026-06-12",coverageEnd:"2026-05-11",annualPremiumBwp:100}),/invalid_date/);
 assert.equal(db.calls.length,0);
});
test("due reminders stay company-scoped",async()=>{
 const db=fake(),api=corporateAssetService(db);
 await api.dueItems(identity,"2026-11-01");
 assert.equal(db.calls.length,2);
 assert(db.calls.every(c=>c.params[0]===companyId&&c.params[1]==="2026-11-01"&&c.sql.includes("company_id=$1")));
});
test("depreciation estimate respects salvage floor",()=>{
 assert.equal(depreciationEstimate({costBwp:10000,ratePercent:10,years:3}),7000);
 assert.equal(depreciationEstimate({costBwp:10000,ratePercent:50,years:8,salvageBwp:2000}),2000);
 assert.throws(()=>depreciationEstimate({costBwp:100,ratePercent:150,years:1}),/invalid_depreciation/);
});

test("accepts valid BWP cents despite binary floating point rounding",async()=>{
 const db=fake(),api=corporateAssetService(db);
 await api.createAsset(identity,{assetName:"Small part",category:"Other",branch:"Gaborone",acquisitionDate:"2026-01-02",acquisitionCostBwp:0.29,bookValueBwp:0.29});
 assert.equal(db.calls.length,1);
 assert.equal(db.calls[0].params[7],0.29);
});
