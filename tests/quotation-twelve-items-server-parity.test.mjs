import test from "node:test";
import assert from "node:assert/strict";
import {validateQuotationDraft} from "../server/quotation-draft-model.mjs";
import {createQuotationDraftD1Store} from "../server/quotation-draft-d1-store.mjs";
const make=(count)=>({
 quoteNumber:"SYN-12",issueDate:"2026-11-16",
 customerName:"Synthetic customer",customerContact:"00000000",
 items:Array.from({length:count},(_,i)=>({
  description:i===6?"Concrete":i===7?"Grout 2kg":"Material "+(i+1),
  quantity:1,unitPriceCents:10000
 })),discountCents:0
});
test("server accepts twelve separate editable line items without coalescing",()=>{
 const data=validateQuotationDraft(make(12));
 assert.equal(data.items.length,12);
 assert.equal(data.items[6].description,"Concrete");
 assert.equal(data.items[7].description,"Grout 2kg");
 assert.equal(data.grandTotalCents,120000);
});
test("server rejects item 13 and oversized line subtotal",()=>{
 assert.throws(()=>validateQuotationDraft(make(13)),/invalid_quotation_item_count/);
 const invalid=make(12);invalid.items[0].quantity=999;
 invalid.items[0].unitPriceCents=1000000000;
 assert.throws(()=>validateQuotationDraft(invalid),/invalid_quotation_line_total/);
});
test("D1 adapter can persist and read twelve rows without changing tenant isolation",async()=>{
 const map=new Map();
 const db={prepare(sql){return {bind(...args){return {
  async first(){
   assert.match(sql,/tenant_id/);
   const row=map.get(args[0]+"|"+args[1]);
   return row?structuredClone(row):null;
  },
  async run(){
   assert.match(sql,/tenant_id/);
   if(sql.startsWith("INSERT OR IGNORE")){
    const [tenant,id,body]=args,key=tenant+"|"+id;
    if(map.has(key))return {success:true,meta:{changes:0}};
    map.set(key,{revision:1,draft_json:body});
    return {success:true,meta:{changes:1}};
   }
   throw Error("unexpected query");
  }
 }}}}};
 const store=createQuotationDraftD1Store({db});
 assert.deepEqual(await store.save({companyId:"syntheticA",draftId:"q12",expectedRevision:0,draft:make(12)}),{revision:1});
 assert.equal((await store.read({companyId:"syntheticA",draftId:"q12"})).draft.items.length,12);
 assert.equal(await store.read({companyId:"syntheticB",draftId:"q12"}),null);
});
