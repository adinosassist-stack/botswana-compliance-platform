import test from "node:test";
import assert from "node:assert/strict";
import {quotationCustomSample} from "../public/js/quotation-customizable-page-model.mjs";
import {validateQuotationDraft} from "../server/quotation-draft-model.mjs";
import {createQuotationDraftD1Store} from "../server/quotation-draft-d1-store.mjs";
import {handleQuotationDraftPersistence} from "../server/quotation-draft-persistence-http.mjs";
const sample=()=>{
 const c=quotationCustomSample();
 c.customerName="Synthetic User";
 c.customerPhone="+267 71 000 000";
 c.copy.heading="SYNTHETIC QUOTATION";
 c.termsText="Synthetic, operator-controlled full terms. Do not issue.";
 c.items.push({description:"Extra material 1",quantity:"1",unitPrice:"12.50"},
              {description:"Extra material 2",quantity:"2",unitPrice:"5.25"},
              {description:"Extra material 3",quantity:"1",unitPrice:"10.00"});
 return c;
};
const draft=(page=sample())=>({
 quoteNumber:page.quoteNumber,issueDate:page.issueDate,
 customerName:page.customerName,customerContact:page.customerPhone,
 items:page.items.map(r=>({description:r.description,quantity:Number(r.quantity),
    unitPriceCents:Math.round(Number(r.unitPrice)*100)})),
 discountCents:0,paymentMethod:"Bank transfer",customPage:page
});
const fixture=()=>{
 const rows=new Map();
 const db={prepare(sql){return{bind(...args){return{
  async first(){
   assert.match(sql,/tenant_id/);
   return structuredClone(rows.get(args[0]+"|"+args[1])??null);
  },
  async run(){
   assert.match(sql,/tenant_id/);
   if(sql.startsWith("INSERT OR IGNORE")){
    const [tenant,id,json]=args,key=tenant+"|"+id;
    if(rows.has(key))return {success:true,meta:{changes:0}};
    rows.set(key,{revision:1,draft_json:json});
    return {success:true,meta:{changes:1}};
   }
   if(sql.startsWith("UPDATE quotation_drafts")){
    const [json,tenant,id,rev]=args,key=tenant+"|"+id,old=rows.get(key);
    if(!old||old.revision!==rev)return {success:true,meta:{changes:0}};
    rows.set(key,{revision:rev+1,draft_json:json});
    return {success:true,meta:{changes:1}};
   }
   throw Error("unexpected_sql");
  }
 }}}}};
 const store=createQuotationDraftD1Store({db});
 const call=(method,tenant="companyA",payload=null,id="quote12")=>
  handleQuotationDraftPersistence({
   request:new Request("https://quotation.internal.example.test/api/quotation/drafts"+
     (method==="GET"?"?id="+id:""),{
    method,headers:{"content-type":"application/json","x-csrf-token":"synthetic-csrf"},
    ...(method==="PUT"?{body:JSON.stringify(payload)}:{})
   }),
   actor:{id:"syntheticOwner"},companyId:tenant,
   authorization:{
    assertCompanyReader:async()=>true,assertCompanyEditor:async()=>true
   },
   verifyMutation:async({request})=>request.headers.get("x-csrf-token")==="synthetic-csrf",
   store
  });
 return {call,rows};
};
test("full twelve-row edited wording and terms survive D1 HTTP save/reload",async()=>{
 const f=fixture(),custom=sample();
 const create=await f.call("PUT","companyA",{draftId:"quote12",revision:0,draft:draft(custom)});
 assert.equal(create.status,200,await create.clone().text());
 const loaded=await f.call("GET");
 assert.equal(loaded.status,200);
 const saved=(await loaded.json()).draft;
 assert.deepEqual(saved.customPage,custom);
 assert.equal(saved.items.length,12);
 assert.equal(saved.customPage.copy.footerPhone,"+267 74 583 606");
 assert.equal(saved.customPage.copy.footerEmail,"lovelystones26@gmail.com");
 assert.equal(saved.customPage.items[6].description,"Concrete");
 assert.equal(saved.customPage.items[7].description,"Grout 2kg");
 assert.equal(f.rows.size,1);
 assert.equal((await f.call("GET","companyB")).status,404);
});
test("customization cannot replace canonical money, tenant or customer fields",()=>{
 const bad=draft();
 bad.customPage.items[0].unitPrice="1.00";
 assert.throws(()=>validateQuotationDraft(bad),/invalid_quotation_custom_page_mismatch/);
 const badPhone=draft();badPhone.customPage.customerPhone="FORGED";
 assert.throws(()=>validateQuotationDraft(badPhone),/invalid_quotation_custom_page_mismatch/);
 const tenant=draft();tenant.customPage.tenantId="other";
 assert.throws(()=>validateQuotationDraft(tenant),/unsupported_quotation_custom_page_field/);
});
test("stale full-custom revision cannot overwrite another draft",async()=>{
 const f=fixture(),d=draft();
 assert.equal((await f.call("PUT","companyA",{draftId:"quote12",revision:0,draft:d})).status,200);
 d.customPage.copy.heading="CHANGED HEADING";
 assert.equal((await f.call("PUT","companyA",{draftId:"quote12",revision:1,draft:d})).status,200);
 const stale=draft();stale.customPage.copy.heading="STALE HEADING";
 assert.equal((await f.call("PUT","companyA",{draftId:"quote12",revision:1,draft:stale})).status,409);
 assert.equal((await (await f.call("GET")).json()).draft.customPage.copy.heading,"CHANGED HEADING");
});
test("legacy drafts without customization retain compatibility",()=>{
 const d=draft();delete d.customPage;
 const out=validateQuotationDraft(d);
 assert.equal(Object.hasOwn(out,"customPage"),false);
});
