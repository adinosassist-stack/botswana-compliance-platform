import test from "node:test";
import assert from "node:assert/strict";
import {
 contract,reviewerApprovalText,isIndependentQuotationSqlApproval,
 notificationMarker,notificationBody,hasBeenNotified,runApprovalWatch
} from "../scripts/quotation-sql-approval-watch.mjs";

const event=()=>({
 action:"created",
 repository:{full_name:contract.repository},
 issue:{number:contract.issueNumber},
 comment:{id:123456789,user:{login:"thusico"},body:reviewerApprovalText}
});

test("only exact independently authored two-blob approval qualifies",()=>{
 assert.equal(isIndependentQuotationSqlApproval(event()),true);
 for(const changed of [
  {comment:{...event().comment,user:{login:"adinosassist-stack"}}},
  {comment:{...event().comment,user:{login:"someone-else"}}},
  {comment:{...event().comment,body:"I independently approve provisioning the quotation staging resources."}},
  {comment:{...event().comment,body:"I independently approve quotation SQL execution."}},
  {comment:{...event().comment,body:reviewerApprovalText.replace(contract.logoBlob,"a".repeat(40))}},
  {comment:{...event().comment,body:reviewerApprovalText.replace(contract.draftBlob,"b".repeat(40))}},
  {comment:{...event().comment,body:reviewerApprovalText.replace(contract.databaseId,"c".repeat(36))}},
  {comment:{...event().comment,body:"Do not execute migrations.\n"+reviewerApprovalText}},
  {action:"edited"},{action:"deleted"},{issue:{number:2505}},
  {repository:{full_name:"other/repo"}}
 ]){
  assert.equal(isIndependentQuotationSqlApproval({...event(),...changed}),false);
 }
});

test("notification is explicitly non-executing and duplicate-keyed by comment ID",()=>{
 const msg=notificationBody(event(),"d".repeat(40));
 assert.match(msg,/Approval detected, NOT executed/);
 assert.match(msg,/protected execution action/);
 assert.match(msg,/No migration, template upload/);
 assert.match(msg,new RegExp(contract.databaseId));
 assert.match(msg,new RegExp(contract.logoBlob));
 assert.match(msg,new RegExp(contract.draftBlob));
 assert.ok(msg.includes(notificationMarker(123456789)));
 assert.equal(hasBeenNotified([{body:msg}],123456789),true);
 assert.equal(hasBeenNotified([{body:msg}],123456780),false);
 assert.equal(hasBeenNotified([{body:"No matching marker"}],123456789),false);
 assert.throws(()=>notificationBody({...event(),comment:{
  ...event().comment,user:{login:"unauthorized"}}},"d".repeat(40)),
  /not_verified/);
 assert.throws(()=>notificationBody(event(),"bad-sha"),/source_sha/);
});

test("non-target events are inert even with no GitHub token or network",async()=>{
 assert.deepEqual(await runApprovalWatch({
  GITHUB_REPOSITORY:"other/repo",GITHUB_EVENT_NAME:"issue_comment"
 }),{status:"inert_non_target_event"});
 assert.deepEqual(await runApprovalWatch({
  GITHUB_REPOSITORY:contract.repository,GITHUB_EVENT_NAME:"push"
 }),{status:"inert_non_target_event"});
 await assert.rejects(runApprovalWatch({
  GITHUB_REPOSITORY:contract.repository,GITHUB_EVENT_NAME:"issue_comment"
 }),/not_configured/);
});


test("hourly fallback reports exact previously posted approval once, without SQL",{
 concurrency:false
},async()=>{
 const saved=globalThis.fetch;
 const comments=[{id:123456789,user:{login:"thusico"},body:reviewerApprovalText}];
 const calls=[];
 globalThis.fetch=async(url,init={})=>{
  calls.push({url:String(url),method:init.method,body:init.body});
  assert.ok(String(url).startsWith("https://api.github.com/repos/adinosassist-stack/botswana-compliance-platform/issues/2504/comments"));
  if(init.method==="GET")return new Response(JSON.stringify(comments),{
   status:200,headers:{"content-type":"application/json"}});
  if(init.method==="POST"){
   const posted=JSON.parse(init.body).body;
   assert.match(posted,/Approval detected, NOT executed/);
   assert.ok(posted.includes(notificationMarker(123456789)));
   comments.push({id:987654321,user:{login:"github-actions[bot]"},body:posted});
   return new Response(JSON.stringify({id:987654321}),{status:201,
    headers:{"content-type":"application/json"}});
  }
  throw Error("unexpected_mock_method");
 };
 try{
  const env={GITHUB_REPOSITORY:contract.repository,GITHUB_EVENT_NAME:"schedule",
   GITHUB_TOKEN:"synthetic-test-only",GITHUB_SHA:"d".repeat(40)};
  assert.deepEqual(await runApprovalWatch(env),{status:"approval_notice_posted"});
  assert.equal(calls.filter(x=>x.method==="POST").length,1);
  assert.deepEqual(await runApprovalWatch(env),{
   status:"no_new_exact_independent_execution_approval"});
  assert.equal(calls.filter(x=>x.method==="POST").length,1);
 }finally{globalThis.fetch=saved}
});

test("hourly fallback ignores prior provisioning-only approval",{
 concurrency:false
},async()=>{
 const saved=globalThis.fetch;
 let postCount=0;
 globalThis.fetch=async(_,init={})=>{
  if(init.method==="POST")postCount++;
  return new Response(JSON.stringify([{id:5,user:{login:"thusico"},
   body:"I independently approve provisioning private quotation staging resources only. No D1 migrations."}]),{
    status:200,headers:{"content-type":"application/json"}});
 };
 try{
  assert.deepEqual(await runApprovalWatch({GITHUB_REPOSITORY:contract.repository,
   GITHUB_EVENT_NAME:"schedule",GITHUB_TOKEN:"synthetic-test-only",
   GITHUB_SHA:"d".repeat(40)}),{
   status:"no_new_exact_independent_execution_approval"});
  assert.equal(postCount,0);
 }finally{globalThis.fetch=saved}
});
