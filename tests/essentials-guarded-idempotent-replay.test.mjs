import test from "node:test";
import assert from "node:assert/strict";
import {insertOrReplayAcceptedEssentialsDraft} from "../server/essentials-guarded-idempotent-replay.mjs";
const principal={tenantId:"tenantA",userId:"userA",permissions:["invoice:draft:create"]};
const draft={tenantId:"tenantA",customerId:"customerA",sourceQuotationReference:"Q-1",
 invoiceReference:"ED-new",currency:"BWP",totalMinor:10000,status:"draft"};
const record={id:"draftNew",tenantId:"tenantA",customerId:"customerA",
 sourceQuotationId:"quoteA",idempotencyKey:"keyA",invoiceNumber:"ED-new",
 createdByUserId:"userA",draft};
function existing(changes={}){return {
 id:"draftOld",tenantId:"tenantA",customerId:"customerA",sourceQuotationId:"quoteA",
 invoiceReference:"ED-old",createdByUserId:"userA",status:"draft",
 draft:{...draft,invoiceReference:"ED-old"},...changes
};}
function harness({rows=[],error=null,changes=1}={}){
 let reads=0,writes=0,lastSelect="",lastParams=[];
 return {db:{prepare:sql=>{
  if(sql.trimStart().startsWith("SELECT"))return{bind:(...params)=>({first:async()=>{reads++;lastSelect=sql;lastParams=params;const row=rows.shift();return row?{
   id:row.id,tenant_id:row.tenantId,customer_id:row.customerId,
   source_quotation_id:row.sourceQuotationId,invoice_number:row.invoiceReference,
   status:row.status,created_by_user_id:row.createdByUserId,
   draft_payload_json:JSON.stringify(row.draft)
  }:null}})};
  return{bind:()=>({run:async()=>{writes++;if(error)throw error;
   return{success:true,meta:{changes}}}})};
 }},stats:()=>({reads,writes}),select:()=>({sql:lastSelect,params:lastParams})};
}
const args=db=>({db,principal,record,acceptanceVersion:2,sourceQuotationReference:"Q-1"});
test("first accepted conversion writes once and returns new invoice",async()=>{
 const h=harness();const x=await insertOrReplayAcceptedEssentialsDraft(args(h.db));
 assert.equal(x.replayed,false);assert.equal(x.invoice.invoiceReference,"ED-new");
 assert.deepEqual(h.stats(),{reads:1,writes:1});
});
test("exact same-key retry returns original invoice reference with no write",async()=>{
 const h=harness({rows:[existing()]});
 const x=await insertOrReplayAcceptedEssentialsDraft(args(h.db));
 assert.equal(x.replayed,true);assert.equal(x.invoice.invoiceReference,"ED-old");
 assert.deepEqual(h.stats(),{reads:1,writes:0});
 assert.match(h.select().sql,/JOIN essentials_accepted_quotation_snapshots AS a/);
 assert.match(h.select().sql,/a.state=\x27accepted\x27/);
 assert.match(h.select().sql,/a.acceptance_version=\?/);
 assert.deepEqual(h.select().params,["tenantA","keyA","quoteA","customerA",2,"Q-1",10000]);
});
test("same-key different customer, quotation, actor and payload all conflict",async()=>{
 for(const conflict of [
  {customerId:"other"},{sourceQuotationId:"other"},{createdByUserId:"other"},
  {draft:{...draft,invoiceReference:"ED-old",totalMinor:500}}
 ]){
  const h=harness({rows:[existing(conflict)]});
  await assert.rejects(insertOrReplayAcceptedEssentialsDraft(args(h.db)),/idempotency_conflict/);
  assert.equal(h.stats().writes,0);
 }
});
test("concurrent same-key uniqueness collision recovers only matching original",async()=>{
 const e=Error("UNIQUE constraint failed: essentials_invoice_drafts.tenant_id, essentials_invoice_drafts.idempotency_key");
 const h=harness({rows:[null,existing()],error:e});
 const result=await insertOrReplayAcceptedEssentialsDraft(args(h.db));
 assert.equal(result.replayed,true);assert.equal(result.invoice.invoiceReference,"ED-old");
 assert.deepEqual(h.stats(),{reads:2,writes:1});
 const bad=harness({rows:[null,existing({customerId:"other"})],error:e});
 await assert.rejects(insertOrReplayAcceptedEssentialsDraft(args(bad.db)),/idempotency_conflict/);
});
test("revoked or stale acceptance inserts no rows, never replays as success",async()=>{
 const h=harness({changes:0});
 await assert.rejects(insertOrReplayAcceptedEssentialsDraft(args(h.db)),/acceptance_stale_or_unverified/);
 assert.deepEqual(h.stats(),{reads:1,writes:1});
});
test("invoice-number and source uniqueness, transport failure never recover",async()=>{
 for(const error of [
  Error("UNIQUE constraint failed: essentials_invoice_drafts.tenant_id, essentials_invoice_drafts.invoice_number"),
  Error("UNIQUE constraint failed: essentials_invoice_drafts.tenant_id, essentials_invoice_drafts.source_quotation_id"),
  Error("D1 connection failure")
 ]){
  const h=harness({rows:[null,existing()],error});
  await assert.rejects(insertOrReplayAcceptedEssentialsDraft(args(h.db)),e=>e.message===error.message);
  assert.equal(h.stats().reads,1);
 }
});
test("unauthorized principal, tenant spoof and missing version fail without read/write",async()=>{
 for(const opts of [
  {principal:{...principal,permissions:[]}},
  {record:{...record,tenantId:"tenantB"}},
  {acceptanceVersion:0},
  {sourceQuotationReference:"other"}
 ]){
  const h=harness();
  await assert.rejects(insertOrReplayAcceptedEssentialsDraft({...args(h.db),...opts}));
  assert.deepEqual(h.stats(),{reads:0,writes:0});
 }
});

test("revoked or stale source snapshot cannot replay existing draft",async()=>{
 // The joined database SELECT returns no eligible row for revoked,
 // stale-version, different-reference or different-total acceptance.
 for(const sourceState of ["revoked","version_changed","reference_changed","total_changed"]){
  const h=harness({rows:[null],changes:0});
  await assert.rejects(insertOrReplayAcceptedEssentialsDraft(args(h.db)),
   /acceptance_stale_or_unverified/,sourceState);
  assert.deepEqual(h.stats(),{reads:1,writes:1});
  assert.match(h.select().sql,/a.state='accepted'/);
 }
});
