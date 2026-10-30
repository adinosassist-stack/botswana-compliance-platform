import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {DatabaseSync} from "node:sqlite";
import {createAiExportD1Quota,createQuotaBoundedAiExportService} from "../server/ai-export-atomic-quota.js";
const schema=readFileSync(new URL("../docs/ai-export-quota-schema-candidate.sql",import.meta.url),"utf8");
const actor={authenticated:true,workspaceMember:true,tenantId:"t1",actorId:"a1"};
const request={conversationId:"c1",messageId:"m1",format:"pdf",documentType:"report"};
function fixture({time=1000,maxPerHour=3}={}){
 const sqlite=new DatabaseSync(":memory:");sqlite.exec(schema);
 const db={prepare(sql){const stmt=sqlite.prepare(sql);return{bind(...args){return{first:async()=>stmt.get(...args)||null}}}}};
 return {sqlite,quota:createAiExportD1Quota({db,enabled:true,clock:()=>time,maxPerHour})};
}
test("candidate D1 schema atomically caps simultaneous export requests per tenant+actor",async()=>{
 const x=fixture();
 try{
  const results=await Promise.all(Array.from({length:9},()=>x.quota.admit(actor)));
  assert.equal(results.filter(r=>r.allowed).length,3);
  assert.equal(results.filter(r=>r.reason==="rate_limited").length,6);
  assert.equal(x.sqlite.prepare("SELECT used FROM ai_document_export_quota").get().used,3);
 }finally{x.sqlite.close()}
});
test("a different actor or tenant has a separate quota; unauthorized never allocates a row",async()=>{
 const x=fixture({maxPerHour:1});
 try{
  assert.equal((await x.quota.admit(actor)).allowed,true);
  assert.equal((await x.quota.admit(actor)).allowed,false);
  assert.equal((await x.quota.admit({...actor,actorId:"a2"})).allowed,true);
  assert.equal((await x.quota.admit({...actor,tenantId:"t2"})).allowed,true);
  assert.equal((await x.quota.admit({...actor,authenticated:false})).reason,"unauthorized");
  assert.equal((await x.quota.admit({...actor,actorId:"../danger"})).reason,"unauthorized");
  assert.equal(x.sqlite.prepare("SELECT COUNT(*) AS total FROM ai_document_export_quota").get().total,3);
 }finally{x.sqlite.close()}
});
test("fixed hourly windows reset at boundary without changing prior rows",async()=>{
 const sqlite=new DatabaseSync(":memory:");sqlite.exec(schema);let now=3599999;
 const db={prepare(sql){const stmt=sqlite.prepare(sql);return{bind(...args){return{first:async()=>stmt.get(...args)||null}}}}};
 const quota=createAiExportD1Quota({db,enabled:true,maxPerHour:1,clock:()=>now});
 try{
  assert.equal((await quota.admit(actor)).allowed,true);
  assert.equal((await quota.admit(actor)).reason,"rate_limited");
  now=3600000;
  assert.equal((await quota.admit(actor)).allowed,true);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM ai_document_export_quota").get().total,2);
 }finally{sqlite.close()}
});
test("disabled or truthy-string activation never touches the database",async()=>{
 const db={prepare:()=>{throw Error("database must not be touched")}};
 for(const enabled of [false,undefined,"true",1]){
  const quota=createAiExportD1Quota({db,enabled});
  assert.equal(quota.enabled,false);
  assert.equal((await quota.admit(actor)).reason,"export_disabled");
 }
});
test("invalid D1 schema or storage exception fail closed without sensitive errors",async()=>{
 let calls=0;
 const quota=createAiExportD1Quota({enabled:true,clock:()=>1000,db:{prepare:()=>{calls++;throw Error("secret-connection-password")}}});
 const result=await quota.admit(actor);
 assert.equal(result.allowed,false);
 assert.equal(result.reason,"storage_unavailable");
 assert.equal(JSON.stringify(result).includes("secret"),false);
 assert.equal(calls,1);
});
test("wrapper denies before expensive rendering and never counts invalid requests",async()=>{
 const x=fixture({maxPerHour:2});let jobs=0,downloads=0;
 const service={create:async()=>{jobs++;return {ok:true,id:"j"+jobs}},download:async()=>{downloads++;return {ok:true}}};
 const bounded=createQuotaBoundedAiExportService({service,quota:x.quota,enabled:true});
 try{
  assert.equal((await bounded.create({...request,tenantId:"other"},actor)).ok,false);
  assert.equal((await bounded.create(request,{...actor,workspaceMember:false})).ok,false);
  assert.equal(x.sqlite.prepare("SELECT COUNT(*) AS total FROM ai_document_export_quota").get().total,0);
  assert.equal((await bounded.create(request,actor)).ok,true);
  assert.equal((await bounded.create(request,actor)).ok,true);
  const denied=await bounded.create(request,actor);
  assert.equal(denied.reason,"rate_limited");
  assert.equal(jobs,2);
  assert.equal((await bounded.download("j1",actor)).ok,true);
  assert.equal(downloads,1);
 }finally{x.sqlite.close()}
});
test("wrapper remains disabled until exact true activation on both gates",async()=>{
 let invoked=0;
 const service={create:async()=>{invoked++;return {ok:true}},download:async()=>{invoked++;return {ok:true}}};
 const quota={enabled:true,admit:async()=>({allowed:true})};
 for(const enabled of [false,"true",0,undefined]){
  const bounded=createQuotaBoundedAiExportService({service,quota,enabled});
  assert.equal((await bounded.create(request,actor)).reason,"export_disabled");
  assert.equal((await bounded.download("j1",actor)).reason,"export_disabled");
 }
 assert.equal(invoked,0);
});
