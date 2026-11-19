import test from "node:test";
import assert from "node:assert/strict";
import {createEssentialsVerifiedAcceptanceWriter} from "../server/essentials-private-acceptance-evidence-writer.mjs";
const principal={tenantId:"synthetic-tenant-a",userId:"synthetic-owner-a",
 permissions:["quotation:accept:record"]};
const evidence={verified:true,tenantId:"synthetic-tenant-a",quotationId:"quote-1",
 customerId:"synthetic-customer-a",quotationReference:"Q-1",
 acceptanceVersion:1,totalMinor:15000,acceptedByUserId:"synthetic-owner-a",
 acceptedAt:"2026-11-19T09:00:00Z"};
function harness({verify=async()=>evidence,run=async()=>({success:true,meta:{changes:1}})}={}){
 let verified=0,writes=0,prepared=[];
 const db={prepare:sql=>({bind:(...values)=>({run:async()=>{
  writes++;prepared.push({sql,values});return run();}})})};
 const writer=createEssentialsVerifiedAcceptanceWriter({
  enabled:true,environment:"essentials-private-staging",db,
  verifyAuthoritativeAcceptance:async args=>{verified++;return verify(args)}
 });
 return {writer,stats:()=>({verified,writes,prepared})};
}
test("disabled by default; missing host verifier is refused",()=>{
 assert.throws(()=>createEssentialsVerifiedAcceptanceWriter(),/acceptance_writer_disabled/);
 assert.throws(()=>createEssentialsVerifiedAcceptanceWriter({
  enabled:true,environment:"essentials-private-staging",db:{prepare(){}}}),/acceptance_writer_unconfigured/);
});
test("only trusted verified evidence writes a tenant-bound immutable snapshot",async()=>{
 const {writer,stats}=harness();
 const result=await writer.record({principal,quotationId:"quote-1",customerId:"evil",totalMinor:1});
 assert.deepEqual(result,{tenantId:"synthetic-tenant-a",quotationId:"quote-1",
  acceptanceVersion:1,state:"accepted"});
 assert.equal(stats().writes,1);
 const values=stats().prepared[0].values;
 assert.deepEqual(values,["synthetic-tenant-a","quote-1","synthetic-customer-a","Q-1",
  1,15000,"synthetic-owner-a","2026-11-19T09:00:00Z"]);
 assert.match(stats().prepared[0].sql,/VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,'accepted'\)/);
});
test("permissions and cross-tenant principal denied before verifier or D1",async()=>{
 for(const p of [
  {...principal,permissions:[]},
  {...principal,tenantId:"../../evil"},
  {...principal,userId:""}
 ]){
  const {writer,stats}=harness();
  await assert.rejects(writer.record({principal:p,quotationId:"quote-1"}));
  assert.equal(stats().verified,0);assert.equal(stats().writes,0);
 }
});
test("untrusted, changed or invalid acceptance evidence never reaches D1",async()=>{
 for(const other of [
  null,{...evidence,verified:false},
  {...evidence,tenantId:"synthetic-tenant-b"},
  {...evidence,quotationId:"quote-2"},
  {...evidence,customerId:""},
  {...evidence,totalMinor:-1},
  {...evidence,acceptanceVersion:0},
  {...evidence,acceptedAt:"yesterday"}
 ]){
  const {writer,stats}=harness({verify:async()=>other});
  await assert.rejects(writer.record({principal,quotationId:"quote-1"}),/acceptance_evidence_unverified/);
  assert.equal(stats().writes,0);
 }
});
test("verification outage and unique conflict do not create second acceptance",async()=>{
 const a=harness({verify:async()=>{throw Error("source_unavailable")}});
 await assert.rejects(a.writer.record({principal,quotationId:"quote-1"}),/source_unavailable/);
 assert.equal(a.stats().writes,0);
 const b=harness({run:async()=>{throw Error("SQLITE_CONSTRAINT_UNIQUE")}});
 await assert.rejects(b.writer.record({principal,quotationId:"quote-1"}),/SQLITE_CONSTRAINT_UNIQUE/);
 assert.equal(b.stats().writes,1);
});
test("failed or unverified insert acknowledgement fails closed",async()=>{
 for(const result of [{success:false,meta:{changes:0}},{success:true,meta:{changes:0}},null]){
  const {writer}=harness({run:async()=>result});
  await assert.rejects(writer.record({principal,quotationId:"quote-1"}),/acceptance_write_unverified/);
 }
});
