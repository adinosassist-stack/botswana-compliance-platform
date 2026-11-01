import test from "node:test";
import assert from "node:assert/strict";
import {createCorporateAssetsSummaryReader} from "../server/corporate-assets-summary-reader.js";
const principal={companyId:"11111111-1111-4111-8111-111111111111",userId:"22222222-2222-4222-8222-222222222222"};
test("summary queries are tenant-scoped and use Africa/Gaborone date",async()=>{
 const calls=[];let i=0;
 const reader=createCorporateAssetsSummaryReader({authorize:async()=>true,clock:()=>new Date("2026-11-01T20:30:00Z"),query:async(sql,params,actor)=>{calls.push({sql,params,actor});return {rows:[i++===0?{total:2,book_value:"120.29"}:{total:1}]}}});
 const result=await reader(principal);
 assert.equal(result.bookValueBwp,120.29);
 assert.equal(result.totalAssets,2);
 assert.equal(result.maintenanceDue,1);
 assert.equal(result.insuranceDue,1);
 assert.equal(result.asOf,"2026-11-01");
 assert.equal(calls.length,3);
 assert.ok(calls.every(x=>x.params[0]===principal.companyId&&x.sql.includes("company_id=$1")&&x.actor===principal));
});
test("unauthorized requests never query assets",async()=>{
 let touched=0;const reader=createCorporateAssetsSummaryReader({authorize:async()=>false,query:async()=>{touched++}});
 await assert.rejects(reader(principal),/forbidden/);
 await assert.rejects(reader({...principal,companyId:"bad"}),/unauthorized/);
 assert.equal(touched,0);
});

test("Botswana calendar boundary does not depend on runtime locale format",async()=>{
 const calls=[];
 const reader=createCorporateAssetsSummaryReader({authorize:async()=>true,clock:()=>new Date("2026-11-01T22:30:00Z"),query:async(sql,params)=>{calls.push({sql,params});return {rows:[{total:0,book_value:"0"}]}}});
 const result=await reader(principal);
 assert.equal(result.asOf,"2026-11-02");
 assert.equal(calls[1].params[1],"2026-11-02");
 assert.equal(calls[2].params[1],"2026-11-02");
});
