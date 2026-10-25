import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createEmployeeProposalReviewD1Store} from '../../cloudflare/src/employee-proposal-review-d1-store.js';
import {prepareEmployeeProposalTask,handleAgenticTaskExecutionRequest} from '../../cloudflare/src/agentic-task-execution.js';
import {enqueueEmployeeDispatch,handleEmployeeDispatchRequest} from '../../cloudflare/src/employee-dispatch.js';
import {workflow,proposal} from './employee-provenance-d1.mjs';

export async function seedDispatch(db){
 const tokenHash=createHmac('sha256','synthetic-secret').update('synthetic-cookie').digest('hex');
 const env={DB:db,SESSION_SECRET:'synthetic-secret',PUBLIC_ORIGIN:'https://example.test',THEBE_EMPLOYEE_DISPATCH_ENABLED:'true',THEBE_EMPLOYEE_TASK_PREPARATION_ENABLED:'true',AGENT_BOUNDED_TASK_EXECUTION_MODE:'owner_bounded'};
 await db.batch([
  db.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,role,csrf_token,expires_at) VALUES(?,'author','t1','owner','csrf',datetime('now','+1 hour'))").bind(tokenHash),
  db.prepare("INSERT INTO agent_delegations(id,tenant_id,agent_key,action_key,max_autonomy_level,max_daily_actions,created_by_user_id,approved_by_user_id) VALUES('d1','t1','thebe','task.create',3,5,'author','author')"),
  db.prepare("INSERT INTO agent_execution_grants(id,tenant_id,delegation_id,action_key,approved_by_user_id) VALUES('g1','t1','d1','task.create','author')")
 ]);
 const store=createEmployeeProposalReviewD1Store(db);
 const {proposalKey}=await store.enqueueVersioned({tenantId:'t1',authorId:'author',sourceDefinition:JSON.stringify(workflow),proposal});
 await store.decide({tenantId:'t1',proposalKey,reviewerId:'manager',decision:'approved',reviewedAt:'2026-10-24T00:00:00.000Z'});
 const auth={tenant_id:'t1',user_id:'author',role:'owner',token_hash:tokenHash};
 const prepared=await prepareEmployeeProposalTask({env,auth,proposalKey,delegationId:'d1'});assert.equal(prepared.status,201);
 const requestId=(await prepared.json()).request.id;
 const req=(path,body={})=>new Request('https://example.test'+path,{method:'POST',headers:{cookie:'bw_session=synthetic-cookie','x-csrf-token':'csrf',origin:'https://example.test','content-type':'application/json'},body:JSON.stringify(body)});
 const taskCall=(suffix,body)=>handleAgenticTaskExecutionRequest({env,request:req('/api/agentic/task-execution/requests/'+requestId+'/'+suffix,body)});
 assert.equal((await taskCall('approve')).status,200);
 const permit=await taskCall('jit-permit');assert.equal(permit.status,201);const permitId=(await permit.json()).permit.id;
 const enqueue=()=>enqueueEmployeeDispatch({env,auth,requestId,permitId,proposalKey});
 const call=(body,headers={})=>{const request=req('/api/agentic/employee-dispatch',body);for(const [key,value] of Object.entries(headers))request.headers.set(key,value);return handleEmployeeDispatchRequest({env,request})};
 return {env,auth,requestId,permitId,proposalKey,enqueue,call,taskCall};
}
