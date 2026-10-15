import assert from "node:assert/strict";
import fs from "node:fs";
import {createHmac} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import worker from "../cloudflare/src/worker.js";
import {validateAdvisorAttachments,readAdvisorAttachments} from "../cloudflare/src/advisor-attachments.js";

const sqlite=new DatabaseSync(":memory:");
sqlite.exec(fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8"));
for(const migration of ["044_v79_finance_reconciliation.sql","049_v108_finance_receivables.sql"]){
  sqlite.exec(fs.readFileSync(new URL(`../cloudflare/migrations/${migration}`,import.meta.url),"utf8"));
}
const DB={prepare(sql){let args=[];return {
  bind(...values){args=values;return this},
  async first(){return sqlite.prepare(sql).get(...args)||null},
  async all(){return {results:sqlite.prepare(sql).all(...args)}},
  async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}}
}},async batch(statements){
  sqlite.exec("BEGIN IMMEDIATE");
  try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec("COMMIT");return results}
  catch(error){sqlite.exec("ROLLBACK");throw error}
}};
const secret="test-only-session-secret-32-characters",session="test-owner-session",csrf="test-csrf";
sqlite.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").run("tenant-1","Test workspace");
sqlite.prepare("INSERT INTO users(id,email) VALUES(?,?)").run("owner-1","owner@example.com");
sqlite.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,?,?)").run("tenant-1","owner-1","owner","active");
sqlite.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,role,csrf_token,expires_at) VALUES(?,?,?,?,?,datetime('now','+1 day'))").run(createHmac("sha256",secret).update(session).digest("hex"),"owner-1","tenant-1","owner",csrf);
sqlite.prepare("INSERT INTO subscriptions(tenant_id,plan,status) VALUES(?,?,?)").run("tenant-1","business","active");
sqlite.prepare("INSERT INTO ai_credit_wallets(tenant_id,balance,monthly_allowance) VALUES(?,?,?)").run("tenant-1",100,40);
sqlite.prepare("INSERT INTO app_state(tenant_id,version,state_json) VALUES(?,?,?)").run("tenant-1",1,JSON.stringify({activeCompanyId:"company-1",companies:[{id:"company-1",profile:{industry:"Retail"}}]}));
sqlite.prepare("INSERT INTO business_risk_events(id,tenant_id,event_key,category,severity,source_type,title,rationale,recommended_action,status) VALUES(?,?,?,?,?,?,?,?,?,?)").run("risk-1","tenant-1","test-risk","corporate","high","test","Recorded issue","Follow up required","Review this issue","open");

let providerCalls=0,converterCalls=0,lastPrompt="";
const env={DB,SESSION_SECRET:secret,AUDIT_INTEGRITY_SECRET:"test-only-audit-secret-32-characters",PUBLIC_ORIGIN:"https://app.example",AI:{
 async toMarkdown(file){converterCalls++;assert.equal(file.name,"invoice.pdf");return {format:"markdown",data:"Invoice total P415.00"}},
 async run(model,input){providerCalls++;lastPrompt=input.prompt;return {response:JSON.stringify({answer:"The supplied document says P415.00.",confidence:"medium",actions:[],caveats:[],sourceRefs:["FILE-1","foreign-ref"]})}}
}};
const attach=(name,content)=>({name,data:Buffer.from(content).toString("base64")});
async function ask(attachments,key="",extra={}){return worker.fetch(new Request("https://app.example/api/ai/advisor",{method:"POST",headers:{cookie:`__Host-bw_session=${session}`,origin:"https://app.example","x-csrf-token":csrf,"content-type":"application/json",...(key?{"idempotency-key":key}:{})},body:JSON.stringify({mode:"ask",question:"Review the attachment",attachments,...extra})}),env,{waitUntil(){}})}
try{
 const denied=await worker.fetch(new Request("https://app.example/api/ai/advisor",{method:"POST",headers:{origin:"https://app.example","content-type":"application/json"},body:JSON.stringify({question:"Review a file",attachments:[attach("notes.txt","private")]})}),env,{waitUntil(){}});
 assert.equal(denied.status,401,"file review requires a workspace session");
 let oversized=await ask(undefined,"",{padding:"x".repeat(9000)});assert.equal(oversized.status,413,"ordinary requests retain the 8 KiB cap");
 oversized=await ask([],"",{padding:"x".repeat(3*1024*1024)});assert.equal(oversized.status,400,"attachment stream is bounded before parsing");
 assert.equal(providerCalls,0,"rejected requests do not reach AI");
 let response=await ask([attach("notes.txt","Invoice total P415.00")],"file-review-key-001");
 let body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
 assert.match(lastPrompt,/Invoice total P415/);assert.match(lastPrompt,/ATTACHED_FILES_START/);assert.match(lastPrompt,/unverified user-supplied/);
 assert.deepEqual(body.sourceRefs,["FILE-1"]);assert.equal(body.references[0].type,"user_attachment");assert.match(body.caveats.join(" "),/not been independently verified/);
 const balance=sqlite.prepare("SELECT balance FROM ai_credit_wallets WHERE tenant_id='tenant-1'").get().balance;
 response=await ask([attach("notes.txt","Invoice total P415.00")],"file-review-key-001");assert.equal(response.status,200);assert.equal(providerCalls,1,"replay does not reprocess or rebill");
 response=await ask([attach("notes.txt","Different file bytes")],"file-review-key-001");assert.equal(response.status,409,"same key cannot change file content");
 response=await ask([attach("script.exe","bad")]);assert.equal(response.status,400);assert.equal(providerCalls,1);
 response=await ask([attach("invoice.pdf","%PDF-1.4 sample")]);body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(converterCalls,1);assert.match(lastPrompt,/Invoice total P415/);
 const beforeFailure=sqlite.prepare("SELECT balance FROM ai_credit_wallets WHERE tenant_id='tenant-1'").get().balance;
 env.AI.toMarkdown=async()=>({format:"error",error:"cannot parse"});
 response=await ask([attach("invoice.pdf","%PDF-1.4 broken")]);assert.equal(response.status,503);assert.equal(sqlite.prepare("SELECT balance FROM ai_credit_wallets WHERE tenant_id='tenant-1'").get().balance,beforeFailure,"failed document reads refund credits");
 sqlite.prepare("UPDATE ai_credit_wallets SET balance=0 WHERE tenant_id='tenant-1'").run();
 env.AI.toMarkdown=async()=>{throw Error("conversion must not run without credits")};
 response=await ask([attach("invoice.pdf","%PDF-1.4 sample")]);assert.equal(response.status,402);
 assert.equal(validateAdvisorAttachments([attach("fake.pdf","not a PDF")]).ok,false);
 assert.equal(validateAdvisorAttachments([attach("a.txt",Buffer.alloc(1024*1024+1))]).ok,false);
 assert.equal(validateAdvisorAttachments(Array.from({length:4},()=>attach("a.txt","x"))).ok,false);
 const decoded=validateAdvisorAttachments([attach("large.txt","x".repeat(13000))]);assert(decoded.ok);const docs=await readAdvisorAttachments(null,decoded.files);assert.equal(docs[0].content.length,12000);assert(docs[0].truncated);
 assert(balance<100,"successful review consumes existing advisor credits");
 console.log("ADVISOR_ATTACHMENTS_PASS authenticated review, file references, replay identity, binary conversion, bounds and failure refunds");
}finally{sqlite.close()}
