import test from "node:test";
import assert from "node:assert/strict";
import {prepareQuotationTemplate} from "../server/essentials-quotation-template.mjs";
test("prepares a tenant-labelled template with red accent",()=>{
 const x=prepareQuotationTemplate({tenantId:"tenant-a",name:"Lovely",issuerName:"Lovely Stones PTY LTD",footer:"Contact",terms:"Payment terms",items:[{description:"Granite"}]});
 assert.equal(x.accentColor,"#B91C1C");assert.equal(x.items[0].description,"Granite");assert.equal(x.previewOnly,true);
});
test("rejects invalid accent and excessive rows",()=>{
 const base={tenantId:"tenant-a",name:"Lovely",issuerName:"Lovely Stones",footer:"",terms:""};
 assert.throws(()=>prepareQuotationTemplate({...base,accentColor:"red"}),/invalid_accent/);
 assert.throws(()=>prepareQuotationTemplate({...base,items:Array.from({length:13},()=>({description:"Item"}))}),/invalid_items/);
});

test("supports the existing twelve-row Lovely editor without expanding the limit beyond twelve",()=>{
 const base={tenantId:"tenant-a",name:"Lovely",issuerName:"Lovely Stones",footer:"",terms:""};
 const rows=Array.from({length:12},(_,i)=>({description:`Line ${i+1}`}));
 const prepared=prepareQuotationTemplate({...base,items:rows});
 assert.equal(prepared.items.length,12);
 assert.equal(prepared.items[11].description,"Line 12");
 assert.equal(prepared.previewOnly,true);
 assert.throws(()=>prepareQuotationTemplate({...base,items:[...rows,{description:"Line 13"}]}),/invalid_items/);
});
