import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLifePrivateEnvironment} from '../scripts/verify-thebe-life-private-environment.mjs';
const environment={
  protection_rules:[{type:'required_reviewers',prevent_self_review:true,
    reviewers:[{type:'User',reviewer:{login:'thusico'}}]}],
  deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}
};
const policies={total_count:1,branch_policies:[{name:'main'}]};
const get=(env=environment,branches=policies)=>async path=>
  path.includes('deployment-branch-policies')?branches:env;
test('verified thusico protection, self-review prevention and main-only deployment passes',async()=>{
 const result=await verifyLifePrivateEnvironment(get());
 assert.deepEqual(result,{ready:true,failures:[]});
});
test('missing environment refuses to qualify',async()=>{
 const result=await verifyLifePrivateEnvironment(async()=>{throw Error('403')});
 assert.deepEqual(result,{ready:false,failures:['environment_read_failed']});
});
test('self approval, missing reviewer or broad deployment branches fail closed',async()=>{
 const result=await verifyLifePrivateEnvironment(get({
  protection_rules:[{type:'required_reviewers',prevent_self_review:false,reviewers:[]}],
  deployment_branch_policy:{protected_branches:true,custom_branch_policies:false}
 },{total_count:2,branch_policies:[{name:'main'},{name:'dev'}]}));
 assert.equal(result.ready,false);
 for(const failure of ['thusico_independent_reviewer_missing','self_review_prevention_missing',
  'selected_main_only_policy_required','main_only_branch_rule_required'])assert.ok(result.failures.includes(failure));
});
test('environments with no required reviewers fail closed',async()=>{
 const result=await verifyLifePrivateEnvironment(get({protection_rules:[],deployment_branch_policy:environment.deployment_branch_policy}));
 assert.ok(result.failures.includes('single_required_review_rule_missing'));
});
