import assert from 'node:assert/strict';
import {handleAgenticRequest} from '../cloudflare/src/agentic-core.js';

function mockDb({role='owner',proposalStatus='approved'}={}){
  const calls=[];
  const DB={
    calls,
    prepare(sql){
      const call={sql,bindings:[],kind:null};calls.push(call);
      return {
        bind(...bindings){call.bindings=bindings;return this},
        async first(){
          call.kind='first';
          if(sql.includes('FROM sessions s'))return {user_id:'u1',tenant_id:'tenant-A',csrf_token:'csrf-A',role,email:'owner@example.com'};
          if(sql.includes('FROM agentic_proposals WHERE id=? AND tenant_id=?'))return {id:'p1',run_id:'r1',status:proposalStatus};
          return null;
        },
        async all(){
          call.kind='all';
          if(sql.includes('FROM agentic_outcomes o'))return {results:[{id:'o1',run_id:'r1',proposal_id:'p1',outcome_status:'improved',metric_key:'cash_position',baseline_json:'{"value":100}',observed_json:'{"value":120}',note:'better',created_at:'2026-09-13',proposal_title:'Review cash',proposal_status:'approved'}]};
          return {results:[]};
        },
        async run(){call.kind='run';return {success:true,meta:{changes:1}}}
      };
    },
    async batch(statements){calls.push({sql:'__batch__',kind:'batch',count:statements.length});return statements.map(()=>({success:true}))}
  };
  return DB;
}
const envFor=DB=>({DB,SESSION_SECRET:'x'.repeat(32),PUBLIC_ORIGIN:'https://thebedesk.com',PUBLIC_APP_URL:'https://thebedesk.com'});
const headers=()=>new Headers({cookie:'bw_session=session-token',origin:'https://thebedesk.com','x-csrf-token':'csrf-A','content-type':'application/json'});
async function call({path,method='GET',body,DB=mockDb()}){
  const request=new Request(`https://thebedesk.com${path}`,{method,headers:headers(),body:body?JSON.stringify(body):undefined});
  const response=await handleAgenticRequest({request,logicalPath:path,env:envFor(DB),ctx:{},coreFetch:async()=>new Response('{}')});
  let data=null;try{data=await response.json()}catch{}
  return {response,data,DB};
}

{
  const DB=mockDb({role:'reviewer'});
  const {response,data}=await call({path:'/api/agentic/proposals/p1/outcome',method:'POST',body:{outcomeStatus:'improved'},DB});
  assert.equal(response.status,403);
  assert.equal(data.error,'forbidden');
  assert.equal(DB.calls.some(x=>x.sql.includes('INSERT INTO agentic_outcomes')),false);
}

{
  const DB=mockDb({role:'manager',proposalStatus:'pending'});
  const {response,data}=await call({path:'/api/agentic/proposals/p1/outcome',method:'POST',body:{outcomeStatus:'improved'},DB});
  assert.equal(response.status,409);
  assert.equal(data.error,'proposal_decision_required_before_outcome');
  assert.equal(DB.calls.some(x=>x.sql.includes('INSERT INTO agentic_outcomes')),false);
}

{
  const DB=mockDb({role:'owner',proposalStatus:'approved'});
  const {response,data}=await call({path:'/api/agentic/proposals/p1/outcome',method:'POST',body:{outcomeStatus:'improved',metricKey:'cash_position',baseline:{value:100},observed:{value:120},note:'Measured after owner action.'},DB});
  assert.equal(response.status,201);
  assert.equal(data.ok,true);
  assert.equal(data.measurementOnly,true);
  assert.deepEqual(data.execution,{performed:false,enabled:false});
  const select=DB.calls.find(x=>x.sql.includes('FROM agentic_proposals WHERE id=? AND tenant_id=?'));
  assert.deepEqual(select.bindings,['p1','tenant-A']);
  const insert=DB.calls.find(x=>x.sql.includes('INSERT INTO agentic_outcomes'));
  assert.ok(insert);
  assert.equal(insert.bindings[1],'tenant-A');
  assert.equal(insert.bindings[2],'r1');
  assert.equal(insert.bindings[3],'p1');
  assert.equal(insert.bindings[4],'u1');
  assert.equal(DB.calls.some(x=>/payment|payroll|journal|terminate|filing/i.test(x.sql)&&!x.sql.includes('agentic_')),false);
}

{
  const DB=mockDb();
  const {response,data}=await call({path:'/api/agentic/outcomes',DB});
  assert.equal(response.status,200);
  assert.equal(data.executionEnabled,false);
  assert.equal(data.items.length,1);
  assert.deepEqual(data.items[0].baseline,{value:100});
  const query=DB.calls.find(x=>x.sql.includes('FROM agentic_outcomes o'));
  assert.deepEqual(query.bindings,['tenant-A']);
}

{
  const DB=mockDb();
  const {response,data}=await call({path:'/api/agentic/proposals/p1/outcome',method:'POST',body:{outcomeStatus:'invalid'},DB});
  assert.equal(response.status,400);
  assert.equal(data.error,'invalid_outcome_status');
  assert.equal(DB.calls.some(x=>x.sql.includes('INSERT INTO agentic_outcomes')),false);
}

console.log('V80 agentic Stage 2 runtime authorization gate: PASS');
