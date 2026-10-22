import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {buildEmployeeProposalProvenance} from '../server/employee-proposal-provenance.js';
import {proposal,workflow} from './helpers/employee-provenance-d1.mjs';

const input={tenantId:'t1',authorId:'author',sourceDefinition:JSON.stringify(workflow),proposal};
const sha=value=>createHash('sha256').update(value).digest('hex');

test('versioned identity binds tenant, author, exact workflow bytes and proposal payload',async()=>{
 const result=await buildEmployeeProposalProvenance(input);
 assert.deepEqual(await buildEmployeeProposalProvenance(input),result);
 assert.equal(result.workflowRevision,sha(input.sourceDefinition));
 assert.equal(result.proposalRevision,sha(result.payloadJson));
 assert.deepEqual(JSON.parse(result.proposalKey),['employee-proposal-v2','t1','author','w1',result.workflowRevision,'e1','onboarding_checklist','2026-11-01',result.proposalRevision]);
 assert.equal(JSON.parse(result.payloadJson).title,proposal.title);
 assert.equal(proposal.proposalKey,input.proposal.proposalKey);
});

test('ownership and workflow or payload changes require a different review identity',async()=>{
 const original=await buildEmployeeProposalProvenance(input);
 for(const changed of [
  {...input,authorId:'other-author'},
  {...input,sourceDefinition:JSON.stringify({...workflow,name:'Updated onboarding'}),proposal:{...proposal,workflowName:'Updated onboarding'}},
  {...input,proposal:{...proposal,title:'Review the updated employee onboarding checklist'}}
 ])assert.notEqual((await buildEmployeeProposalProvenance(changed)).proposalKey,original.proposalKey);
});

test('input mutation during hashing cannot change the captured proposal identity',async()=>{
 const mutable={...proposal};
 const pending=buildEmployeeProposalProvenance({...input,proposal:mutable});
 mutable.employeeId='changed-after-capture';mutable.type='payroll_preparation';
 const result=await pending;
 assert.equal(JSON.parse(result.proposalKey)[5],'e1');
 assert.equal(JSON.parse(result.payloadJson).employeeId,'e1');
 assert.equal(JSON.parse(result.proposalKey)[6],'onboarding_checklist');
});

test('provenance rejects missing author and mismatched trusted scope',async()=>{
 for(const changed of [
  {...input,authorId:undefined},{...input,authorId:'bad author'},
  {...input,tenantId:'t2'},
  {...input,proposal:{...proposal,workflowId:'w2'}},
  {...input,proposal:{...proposal,type:'payroll_preparation'}},
  {...input,proposal:{...proposal,effect:'preview'}}
 ])await assert.rejects(buildEmployeeProposalProvenance(changed));
});

test('provenance rejects invalid deadlines and non-proposal states',async()=>{
 for(const changed of [
  {...proposal,dueDate:'2026-02-30'}, {...proposal,status:'approved'},
  {...proposal,requiresHumanReview:false}, {...proposal,title:''},
  {...proposal,severity:'arbitrary'}, {...proposal,workflowName:'Spoofed name'}
 ])await assert.rejects(buildEmployeeProposalProvenance({...input,proposal:changed}));
 await assert.rejects(buildEmployeeProposalProvenance({...input,sourceDefinition:JSON.stringify({...workflow,enabled:false})}));
});
