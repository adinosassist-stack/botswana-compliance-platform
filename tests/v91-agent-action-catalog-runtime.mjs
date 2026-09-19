import assert from 'node:assert/strict';
import {AGENT_ACTION_CATALOG,evaluateAgentAction} from '../cloudflare/src/agent-policy.js';
import {handleAgenticAuthorityRequest} from '../cloudflare/src/agentic-authority-core.js';

const unknownActions=[...Object.getOwnPropertyNames(Object.prototype),'unknown.action'];
let checks=0;
for(const agentKey of ['thebe','management','finance','compliance','tender','operations']){
  for(const actionKey of unknownActions){
    const decision=evaluateAgentAction({agentKey,actionKey,actorRole:'owner',tenantScoped:true});
    assert.equal(decision.allowed,false);
    assert.equal(decision.code,'unknown_action',`${agentKey}: ${actionKey}`);
    checks++;
  }
}

// Exercise the HTTP handlers with a storage double at the D1 boundary. Unknown
// actions must be rejected before a delegation or intent can be written.
async function requestAction(path,actionKey,{agentKey='thebe',role='owner'}={}){
  const writes=[];
  const DB={
    prepare(sql){
      return {
        bind(){return this},
        async first(){
          if(sql.includes('FROM sessions s'))return {user_id:'owner-A',tenant_id:'tenant-A',csrf_token:'csrf-A',role};
          if(sql==='SELECT 1 ok FROM agent_delegations LIMIT 1')return {ok:1};
          return null;
        },
        async run(){writes.push(sql);return {success:true,meta:{changes:1}}}
      };
    },
    async batch(statements){writes.push('batch');return statements.map(()=>({success:true,meta:{changes:1}}))}
  };
  const request=new Request(`https://thebedesk.com${path}`,{
    method:'POST',
    headers:{cookie:'bw_session=test-session',origin:'https://thebedesk.com','x-csrf-token':'csrf-A','content-type':'application/json','idempotency-key':'catalog-regression'},
    body:JSON.stringify({agentKey,actionKey,amountMinor:0,maxAutonomyLevel:3})
  });
  const response=await handleAgenticAuthorityRequest({request,logicalPath:path,env:{DB,SESSION_SECRET:'test-secret',PUBLIC_ORIGIN:'https://thebedesk.com'}});
  return {status:response.status,body:await response.json(),writes};
}

for(const path of ['/api/agentic/authority/delegations','/api/agentic/authority/shadow']){
  for(const agentKey of ['thebe','finance']){
    for(const actionKey of unknownActions){
      const response=await requestAction(path,actionKey,{agentKey});
      assert.equal(response.status,400,`${path}: ${actionKey}`);
      assert.equal(response.body.error,'unknown_action');
      assert.deepEqual(response.writes,[],'invalid actions cannot persist authority');
      checks++;
    }
  }
}

// Positive controls: the dictionary change must preserve registered actions,
// role checks, compatibility routing, and the permanent execution boundary.
for(const definition of Object.values(AGENT_ACTION_CATALOG)){
  const decision=evaluateAgentAction({agentKey:'thebe',actionKey:definition.key,actorRole:'owner',tenantScoped:true});
  assert.equal(decision.allowed,definition.phase1Enabled);
  assert.equal(decision.externalSideEffect,definition.externalSideEffect);
  checks++;
}
let response=await requestAction('/api/agentic/authority/shadow','financial_position.read');
assert.equal(response.status,201);
assert.equal(response.body.decision.allowed,true);
assert.equal(response.body.execution.performed,false);
assert.equal(response.body.execution.enabled,false);
response=await requestAction('/api/agentic/authority/shadow','compliance_status.read',{agentKey:'finance'});
assert.equal(response.status,403);
assert.equal(response.body.error,'agent_action_mismatch');
assert.deepEqual(response.writes,[]);
response=await requestAction('/api/agentic/authority/delegations','task.create',{role:'manager'});
assert.equal(response.status,403);
assert.equal(response.body.error,'owner_required');
response=await requestAction('/api/agentic/authority/delegations','payment.execute');
assert.equal(response.status,409);
assert.equal(response.body.error,'human_only_action');
assert.deepEqual(response.writes,[]);
console.log(`v91 agent action catalogue: ${checks} matrix checks plus HTTP compatibility controls passed`);
