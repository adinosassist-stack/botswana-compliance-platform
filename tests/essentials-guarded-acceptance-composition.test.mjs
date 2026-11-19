import test from "node:test";
import assert from "node:assert/strict";
import {createEssentialsGuardedAcceptanceComposition} from "../server/essentials-guarded-acceptance-composition.mjs";
const principal={tenantId:"tenantA",userId:"userA",permissions:["invoice:draft:create"]};
const quotation={id:"quoteA",companyId:"tenantA",customerId:"customerA",
 reference:"Q-101",status:"accepted",acceptanceVersion:2,
 items:[{description:"Memorial",quantity:1,unitMinor:10000,lineMinor:10000}],
 discountMinor:0,totalMinor:10000};
const uuids=["123e4567-e89b-42d3-a456-426614174000","123e4567-e89b-42d3-a456-426614174001"];
function fixture({quote=quotation,changes=1,load,fail=false}={}){
 let writes=0,reads=0,sql="",bound=[];
 const db={prepare:s=>{if(s.trimStart().startsWith("SELECT"))return {bind:()=>({first:async()=>null})};sql=s;return{bind:(...v)=>{bound=v;return{run:async()=>{
  writes++;if(fail)throw Error("d1_unavailable");
  return{success:true,meta:{changes}};
 }}}}}};
 let idx=0;
 const app=createEssentialsGuardedAcceptanceComposition({
  enabled:true,environment:"essentials-private-staging",db,
  randomUUID:()=>uuids[idx++],
  loadAcceptedQuotationForTenant:async args=>{reads++;return load?load(args):quote}
 });
 return {app,stats:()=>({writes,reads,sql,bound})};
}
test("must explicitly enable private staging and supply authoritative loader",()=>{
 assert.throws(()=>createEssentialsGuardedAcceptanceComposition(),/guarded_composition_disabled/);
 assert.throws(()=>createEssentialsGuardedAcceptanceComposition({
  enabled:true,environment:"essentials-private-staging",db:{prepare(){}}
 }),/guarded_composition_unconfigured/);
});
test("authenticated accepted quotation uses atomic accepted snapshot predicate",async()=>{
 const f=fixture();
 const result=await f.app.createDraft({
  principal,quotationId:"quoteA",idempotencyKey:"keyA",createdAt:"2026-11-19"});
 assert.equal(result.replayed,false);
 assert.equal(result.invoice.sourceQuotationId,"quoteA");
 assert.equal(f.stats().writes,1);
 assert.match(f.stats().sql,/FROM essentials_accepted_quotation_snapshots/);
 assert.match(f.stats().sql,/a.state='accepted'/);
 assert.equal(f.stats().bound[9],2);
 assert.equal(f.stats().bound[10],10000);
});
test("permissions, tenant spoofing and missing accepted status fail before D1",async()=>{
 for(const p of [null,{...principal,permissions:[]},{...principal,tenantId:"bad/id"}]){
  const f=fixture();
  await assert.rejects(f.app.createDraft({principal:p,quotationId:"quoteA",idempotencyKey:"keyA",createdAt:"2026-11-19"}));
  assert.equal(f.stats().writes,0);
 }
 for(const q of [null,{...quotation,companyId:"tenantB"},{...quotation,id:"another"},
  {...quotation,status:"draft"},{...quotation,acceptanceVersion:0}]){
  const f=fixture({quote:q});
  await assert.rejects(f.app.createDraft({principal,quotationId:"quoteA",idempotencyKey:"keyA",createdAt:"2026-11-19"}));
  assert.equal(f.stats().writes,0);
 }
});
test("revoked between quotation read and D1 INSERT is rejected with no success response",async()=>{
 const f=fixture({changes:0});
 await assert.rejects(f.app.createDraft({
  principal,quotationId:"quoteA",idempotencyKey:"keyA",createdAt:"2026-11-19"
 }),/acceptance_stale_or_unverified/);
 assert.equal(f.stats().writes,1);
});
test("D1 outage never reports an issued invoice or success",async()=>{
 const f=fixture({fail:true});
 await assert.rejects(f.app.createDraft({
  principal,quotationId:"quoteA",idempotencyKey:"keyA",createdAt:"2026-11-19"
 }),/d1_unavailable/);
});
