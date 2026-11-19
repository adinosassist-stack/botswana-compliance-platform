import test from "node:test";
import assert from "node:assert/strict";
import {createEssentialsGuardedAcceptanceComposition} from "../server/essentials-guarded-acceptance-composition.mjs";

const principal={tenantId:"tenantA",userId:"userA",permissions:["invoice:draft:create"]};
const quotation={id:"quoteA",companyId:"tenantA",customerId:"customerA",
 reference:"Q-101",status:"accepted",acceptanceVersion:2,
 items:[{description:"Memorial",quantity:1,unitMinor:10000,lineMinor:10000}],
 discountMinor:0,totalMinor:10000};
const uuids=["123e4567-e89b-42d3-a456-426614174000","123e4567-e89b-42d3-a456-426614174001"];
const params={principal,quotationId:"quoteA",idempotencyKey:"keyA",createdAt:"2026-11-19"};
function fixture({old=null,acceptanceEligible=true,sqlError=null,load=async()=>quotation}={}){
 let reads=0,writes=0,loads=0,lookupSql="",lookupArgs=[];
 const db={prepare:sql=>{
  if(sql.trimStart().startsWith("SELECT")){
   lookupSql=sql;
   return {bind:(...args)=>({first:async()=>{
    reads++;lookupArgs=args;
    if(!old||!acceptanceEligible)return null;
    return{id:old.id,tenant_id:"tenantA",customer_id:"customerA",
     source_quotation_id:"quoteA",invoice_number:old.reference,status:"draft",
     created_by_user_id:"userA",draft_payload_json:JSON.stringify({
      tenantId:"tenantA",customerId:"customerA",sourceQuotationReference:"Q-101",
      invoiceReference:old.reference,createdAt:"2026-11-19",status:"draft",
      currency:"BWP",items:[{description:"Memorial",quantity:1,unitMinor:10000,lineMinor:10000}],
      subtotalMinor:10000,discountMinor:0,totalMinor:10000
     })};
   }})};
  }
  return {bind:()=>({run:async()=>{
   writes++;if(sqlError)throw sqlError;
   return {success:true,meta:{changes:acceptanceEligible?1:0}};
  }})};
 }};
 let i=0;
 const app=createEssentialsGuardedAcceptanceComposition({
  enabled:true,environment:"essentials-private-staging",db,
  randomUUID:()=>uuids[i++],loadAcceptedQuotationForTenant:async arg=>{loads++;return load(arg)}
 });
 return {app,stats:()=>({reads,writes,loads,lookupSql,lookupArgs})};
}
test("matching retry returns ORIGINAL invoice ref and rechecks snapshot in same SELECT",async()=>{
 const h=fixture({old:{id:"originalDraft",reference:"ED-original"}});
 const x=await h.app.createDraft(params);
 assert.equal(x.replayed,true);
 assert.equal(x.invoice.invoiceReference,"ED-original");
 assert.equal(h.stats().writes,0);
 assert.equal(h.stats().loads,1);
 assert.match(h.stats().lookupSql,/JOIN essentials_accepted_quotation_snapshots/);
 assert.match(h.stats().lookupSql,/a.state='accepted'/);
 assert.deepEqual(h.stats().lookupArgs,["tenantA","keyA","quoteA","customerA",2,"Q-101",10000]);
});
test("revoked acceptance refuses previous matching draft (no replay)",async()=>{
 const h=fixture({old:{id:"originalDraft",reference:"ED-original"},acceptanceEligible:false});
 await assert.rejects(h.app.createDraft(params),/acceptance_stale_or_unverified/);
 assert.equal(h.stats().reads,1);
 assert.equal(h.stats().writes,1);
});
test("quotations with unaccepted status are denied before retry lookup",async()=>{
 const h=fixture({old:{id:"originalDraft",reference:"ED-original"},load:async()=>({...quotation,status:"draft"})});
 await assert.rejects(h.app.createDraft(params),/quotation_not_accepted/);
 assert.equal(h.stats().reads,0);
 assert.equal(h.stats().writes,0);
});
test("unique idempotency race recovers original only after eligible replay read",async()=>{
 // The first lookup returns no row; a concurrent insert wins, and the
 // conflict-recovery lookup finds the accepted matching draft.
 let reads=0,writes=0;
 const oldPayload={tenantId:"tenantA",customerId:"customerA",sourceQuotationReference:"Q-101",
  invoiceReference:"ED-original",createdAt:"2026-11-19",status:"draft",currency:"BWP",
  items:[{description:"Memorial",quantity:1,unitMinor:10000,lineMinor:10000}],
  subtotalMinor:10000,discountMinor:0,totalMinor:10000};
 const db={prepare:sql=>{
  if(sql.trimStart().startsWith("SELECT"))return{bind:()=>({first:async()=>{
   reads++;return reads===1?null:{
    id:"originalDraft",tenant_id:"tenantA",customer_id:"customerA",
    source_quotation_id:"quoteA",invoice_number:"ED-original",status:"draft",
    created_by_user_id:"userA",draft_payload_json:JSON.stringify(oldPayload)
   };
  }})};
  return{bind:()=>({run:async()=>{writes++;throw Error(
   "UNIQUE constraint failed: essentials_invoice_drafts.tenant_id, essentials_invoice_drafts.idempotency_key"
  )}})};
 }};
 let i=0;
 const app=createEssentialsGuardedAcceptanceComposition({
  enabled:true,environment:"essentials-private-staging",db,
  randomUUID:()=>uuids[i++],loadAcceptedQuotationForTenant:async()=>quotation
 });
 const x=await app.createDraft(params);
 assert.equal(x.replayed,true);assert.equal(x.invoice.invoiceReference,"ED-original");
 assert.equal(reads,2);assert.equal(writes,1);
});
