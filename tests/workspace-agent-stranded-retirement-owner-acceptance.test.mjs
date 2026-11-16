import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessOwnerStatement,expectedOwnerStatement,OWNER_LOGIN} from '../scripts/workspace-agent-stranded-retirement-owner-acceptance.mjs';
const SHA='89ba34dd7c47af9b4fc8949494d7dfcb25e9df4c';
const sample=()=>({sha:SHA,actor:OWNER_LOGIN,comment:{
 id:12345,user:{login:OWNER_LOGIN},
 issue_url:'https://api.github.com/repos/adinosassist-stack/botswana-compliance-platform/issues/2505',
 body:expectedOwnerStatement(SHA),created_at:'2026-11-16T00:12:00Z',updated_at:'2026-11-16T00:12:00Z'
}});
test('exact authenticated owner comment yields only a verified statement, not execution',()=>{
 assert.deepEqual(assessOwnerStatement(sample()),{
  statementVerified:true,reasons:[],independentReviewerApprovalStillRequired:true,
  destructiveOperationPerformed:false
 });
});
test('user cannot recycle prior-main acceptance',()=>{
 const x=sample();x.sha='472dcd43a766c5edff583890b81f50932ee3d34d';
 assert.equal(assessOwnerStatement(x).statementVerified,false);
});
test('reviewer and other actor cannot act as owner',()=>{
 const x=sample();x.actor='thusico';
 assert.ok(assessOwnerStatement(x).reasons.includes('run_not_initiated_by_owner'));
 const y=sample();y.comment.user.login='thusico';
 assert.ok(assessOwnerStatement(y).reasons.includes('owner_comment_author_not_verified'));
});
test('comment must be on expected repo and decision PR, not a foreign issue',()=>{
 const x=sample();x.comment.issue_url=x.comment.issue_url.replace('/2505','/2506');
 assert.equal(assessOwnerStatement(x).statementVerified,false);
});
test('edited comment and tiny wording change are rejected',()=>{
 const x=sample();x.comment.updated_at='2026-11-16T00:12:01Z';
 assert.equal(assessOwnerStatement(x).statementVerified,false);
 const y=sample();y.comment.body+=' extra';
 assert.equal(assessOwnerStatement(y).statementVerified,false);
});
test('missing comment and invalid SHA are rejected',()=>{
 assert.equal(assessOwnerStatement().statementVerified,false);
 const x=sample();x.sha='invalid';
 assert.equal(assessOwnerStatement(x).statementVerified,false);
});
