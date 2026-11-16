import test from "node:test";
import assert from "node:assert/strict";
import {evaluateQuotationDraft,prepareQuotationSnapshot,moneyToMinor} from "../server/quotation-model.mjs";
const fixture=()=>({items:[
 {description:"Tombstone",quantity:1,unitPrice:"14000.00"},
 {description:"Cement",quantity:2,unitPrice:0,suppliedBy:"customer"},
 {description:"Wheel barrow (river sand)",quantity:8,unitPrice:0,suppliedBy:"customer"},
 {description:"20 KG Adhesive",quantity:5,unitPrice:0,suppliedBy:"customer"},
 {description:"600*600 Black floor tiles",quantity:7,unitPrice:0,suppliedBy:"customer"},
 {description:"Bricks",quantity:60,unitPrice:0,suppliedBy:"customer"},
 {description:"Concrete,Grout2kg",quantity:1,unitPrice:0,suppliedBy:"customer"},
 {description:"Labour/Transport",quantity:1,unitPrice:0,free:true}
],discount:"0"});
test("source #80 produces P14,000 exactly and free != customer-supplied",()=>{
 const r=evaluateQuotationDraft(fixture());
 assert.equal(r.subtotalDisplay,"14,000.00");assert.equal(r.discountDisplay,"0.00");
 assert.equal(r.totalDisplay,"14,000.00");assert.equal(r.items[1].unitDisplay,"0.00");
 assert.equal(r.items[7].unitDisplay,"free");assert.equal(r.items[7].totalDisplay,"free");
});
test("rejects unsupported money, discounts and inconsistent free labels",()=>{
 assert.throws(()=>moneyToMinor("1.001"),/invalid_money/);
 assert.throws(()=>evaluateQuotationDraft({...fixture(),discount:"14000.01"}),/discount_exceeds_subtotal/);
 assert.throws(()=>evaluateQuotationDraft({items:[{description:"X",quantity:1,unitPrice:"-1"}]}),/invalid_money/);
 assert.throws(()=>evaluateQuotationDraft({items:[{description:"X",quantity:1,unitPrice:2,free:true}]}),/nonzero_no_charge/);
});
test("integer minor arithmetic eliminates floating point drift",()=>{
 const r=evaluateQuotationDraft({items:[{description:"S",quantity:3,unitPrice:"0.10"}],discount:"0.20"});
 assert.equal(r.totalDisplay,"0.10");
});
test("issued candidate contains tenant-specific version identifiers",()=>{
 const s=prepareQuotationSnapshot({company:{id:"c1",name:"Lovely Tombstones",templateKey:"lovely-v1",termsVersion:"approved-1",logoVersion:"logo-1"},customer:{id:"customer1",name:"Example"},draft:fixture(),reference:"#80",issuedAt:"2026-11-10"});
 assert.equal(s.totalMinor,1400000);assert.equal(s.companyId,"c1");assert.ok(Object.isFrozen(s));
});
