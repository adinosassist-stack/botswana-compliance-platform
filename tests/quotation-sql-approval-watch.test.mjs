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
