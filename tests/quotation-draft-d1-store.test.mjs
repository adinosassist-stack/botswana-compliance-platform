import test from "node:test";
import assert from "node:assert/strict";
import {createQuotationDraftD1Store} from "../server/quotation-draft-d1-store.mjs";
const draft=()=>({
 quoteNumber:"Q01",issueDate:"2026-11-15",customerName:"Synthetic",
 customerContact:"Gaborone",items:[{description:"Memorial",quantity:2,unitPriceCents:120000}],
 discountCents:0
});
function fixture(){
 const rows=new Map(),queries=[];
 const db={prepare(sql){
  return {bind(...args){return {
   async first(){
    queries.push({sql,args});
    const row=rows.get(args[0]+"|"+args[1]);
    return row?structuredClone(row):null;
   },
   async run(){
    queries.push({sql,args});
    if(sql.startsWith("INSERT OR IGNORE")){
     const [tenant,id,body]=args,key=tenant+"|"+id;
     if(rows.has(key))return {success:true,meta:{changes:0}};
     rows.set(key,{revision:1,draft_json:body});
     return {success:true,meta:{changes:1}};
    }
    if(sql.startsWith("UPDATE quotation_drafts")){
     const [body,tenant,id,revision]=args,key=tenant+"|"+id,row=rows.get(key);
     if(!row||row.revision!==revision)return {success:true,meta:{changes:0}};
     rows.set(key,{revision:revision+1,draft_json:body});
     return {success:true,meta:{changes:1}};
    }
    throw Error("unexpected_sql");
   }
  }}}
 }};
 return {store:createQuotationDraftD1Store({db}),rows,queries};
}
test("company-scoped create, read and optimistic revision update",async()=>{
 const {store,queries}=fixture();
 assert.equal(await store.read({companyId:"A",draftId:"d1"}),null);
 assert.deepEqual(await store.save({companyId:"A",draftId:"d1",expectedRevision:0,draft:draft()}),{revision:1});
 const read=await store.read({companyId:"A",draftId:"d1"});
 assert.equal(read.revision,1);
 assert.equal(read.draft.items[0].unitPriceCents,120000);
 assert.equal(Object.hasOwn(read.draft,"subtotalCents"),false);
 const next=draft();next.customerName="Another synthetic";
 assert.deepEqual(await store.save({companyId:"A",draftId:"d1",expectedRevision:1,draft:next}),{revision:2});
 assert.equal((await store.read({companyId:"A",draftId:"d1"})).draft.customerName,"Another synthetic");
 assert.ok(queries.every(x=>!x.sql.includes(" OR REPLACE ")));
});
test("revisions never overwrite newer data or create missing draft at revision >0",async()=>{
 const {store}=fixture();
 assert.deepEqual(await store.save({companyId:"A",draftId:"d1",expectedRevision:1,draft:draft()}),{conflict:true});
 await store.save({companyId:"A",draftId:"d1",expectedRevision:0,draft:draft()});
 assert.deepEqual(await store.save({companyId:"A",draftId:"d1",expectedRevision:0,draft:draft()}),{conflict:true});
 const changed=draft();changed.customerName="Updated";
 await store.save({companyId:"A",draftId:"d1",expectedRevision:1,draft:changed});
 assert.deepEqual(await store.save({companyId:"A",draftId:"d1",expectedRevision:1,draft:draft()}),{conflict:true});
 assert.equal((await store.read({companyId:"A",draftId:"d1"})).draft.customerName,"Updated");
});
test("private read/write boundaries include tenant ID every time",async()=>{
 const {store,queries}=fixture();
 await store.save({companyId:"A",draftId:"same",expectedRevision:0,draft:draft()});
 await store.save({companyId:"B",draftId:"same",expectedRevision:0,draft:draft()});
 assert.equal((await store.read({companyId:"B",draftId:"same"})).revision,1);
 assert.equal(await store.read({companyId:"C",draftId:"same"}),null);
 for(const q of queries)assert.match(q.sql,/tenant_id=/);
});
test("invalid identifiers and corrupt saved content fail closed",async()=>{
 const {store,rows}=fixture();
 await assert.rejects(store.save({companyId:"../A",draftId:"d1",expectedRevision:0,draft:draft()}),/invalid_draft_reference/);
 await assert.rejects(store.read({companyId:"A",draftId:"../d1"}),/invalid_draft_reference/);
 rows.set("A|d1",{revision:1,draft_json:'{"invalid":true}'});
 await assert.rejects(store.read({companyId:"A",draftId:"d1"}),/quotation_draft_d1_corrupt/);
});
