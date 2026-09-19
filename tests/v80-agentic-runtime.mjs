import assert from 'node:assert/strict';
import {handleAgenticRequest} from '../cloudflare/src/agentic-core.js';

function mockDb({role='owner',proposal={id:'p1',run_id:'r1',status:'pending'},decisionChanges=1,currentStatus='rejected'}={}){
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
          if(sql.startsWith('SELECT status FROM agentic_proposals'))return {status:currentStatus};
          if(sql.includes('FROM agentic_proposals WHERE id=? AND tenant_id=?'))return proposal;
          return null;
        },
        async all(){call.kind='all';return {results:[]}},
        async run(){call.kind='run';return {success:true,meta:{changes:sql.startsWith('UPDATE agentic_proposals')?decisionChanges:1}}}
      };
    },
    async batch(statements){calls.push({sql:'__batch__',bindings:[],kind:'batch',count:statements.length});return statements.map(()=>({success:true}))}
  };
  return DB;
}

const envFor=(DB)=>({DB,SESSION_SECRET:'x'.repeat(32),PUBLIC_ORIGIN:'https://thebedesk.com',PUBLIC_APP_URL:'https://thebedesk.com'});
const authedHeaders=({csrf=true,origin='https://thebedesk.com'}={})=>{
  const headers=new Headers({cookie:'bw_session=session-token',origin});
  if(csrf)headers.set('x-csrf-token','csrf-A');
  return headers;
};
const call=async({path,method='GET',headers,DB=mockDb(),role,proposal}={})=>{
  if(role||proposal)DB=mockDb({role:role||'owner',proposal:proposal||{id:'p1',run_id:'r1',status:'pending'}});
  const request=new Request(`https://thebedesk.com${path}`,{method,headers});
  const response=await handleAgenticRequest({request,logicalPath:path,env:envFor(DB),ctx:{},coreFetch:async()=>new Response('{}',{status:500})});
  let body=null;try{body=await response.json()}catch{}
  return {response,body,DB};
};

{
  const DB=mockDb();
  const request=new Request('https://thebedesk.com/api/agentic/status');
  const response=await handleAgenticRequest({request,logicalPath:'/api/agentic/status',env:envFor(DB),ctx:{},coreFetch:async()=>new Response('{}')});
  assert.equal(response.status,401);
  assert.equal((await response.json()).error,'unauthenticated');
}

{
  const {response,body}=await call({path:'/api/agentic/status',headers:authedHeaders()});
  assert.equal(response.status,200);
  assert.equal(body.executionEnabled,false);
  assert.equal(body.approvalRecordsEnabled,true);
  assert.ok(body.prohibitedAutonomy.includes('payments_and_transfers'));
  assert.ok(body.prohibitedAutonomy.includes('employee_discipline_or_termination'));
}

{
  const {response,body,DB}=await call({path:'/api/agentic/plan',method:'POST',headers:authedHeaders({csrf:false})});
  assert.equal(response.status,403);
  assert.equal(body.error,'csrf_failed');
  assert.equal(DB.calls.some(x=>x.kind==='batch'),false,'CSRF failure must occur before any planning persistence');
}

{
  const {response,body}=await call({path:'/api/agentic/plan',method:'POST',headers:authedHeaders({origin:'https://evil.example'})});
  assert.equal(response.status,403);
  assert.equal(body.error,'origin_failed');
}

{
  const DB=mockDb({role:'reviewer'});
  const {response,body}=await call({path:'/api/agentic/proposals/p1/approve',method:'POST',headers:authedHeaders(),DB});
  assert.equal(response.status,403);
  assert.equal(body.error,'owner_approval_required');
  assert.equal(DB.calls.some(x=>x.sql.startsWith('UPDATE agentic_proposals')),false,'reviewer approval must not mutate proposal state');
}

{
  const DB=mockDb({role:'owner'});
  const {response,body}=await call({path:'/api/agentic/proposals/p1/approve',method:'POST',headers:authedHeaders(),DB});
  assert.equal(response.status,200);
  assert.equal(body.ok,true);
  assert.equal(body.status,'approved');
  assert.deepEqual(body.execution,{performed:false,enabled:false,reason:'Stage 1 records governance decisions only.'});
  const select=DB.calls.find(x=>x.sql.includes('FROM agentic_proposals WHERE id=? AND tenant_id=?'));
  assert.ok(select,'proposal lookup must be tenant-scoped');
  assert.deepEqual(select.bindings,['p1','tenant-A']);
  const update=DB.calls.find(x=>x.sql.startsWith('UPDATE agentic_proposals'));
  assert.ok(update,'owner approval records the decision');
  assert.deepEqual(update.bindings,['approved','u1','p1','tenant-A']);
  assert.ok(DB.calls.some(x=>x.sql.includes('INSERT INTO agentic_events')),'approval creates an audit event');
  assert.equal(DB.calls.some(x=>/execute|payment|journal|payroll/i.test(x.sql)&&!x.sql.includes('agentic_proposals')),false,'approval must not dispatch a side-effect query');
}

{
  const DB=mockDb({role:'manager'});
  const {response,body}=await call({path:'/api/agentic/proposals/p1/reject',method:'POST',headers:authedHeaders(),DB});
  assert.equal(response.status,200);
  assert.equal(body.status,'rejected');
  assert.equal(body.execution.performed,false);
}

{
  const DB=mockDb({role:'owner',decisionChanges:0,currentStatus:'rejected'});
  const {response,body}=await call({path:'/api/agentic/proposals/p1/approve',method:'POST',headers:authedHeaders(),DB});
  assert.equal(response.status,409);
  assert.equal(body.error,'agentic_proposal_already_decided');
  assert.equal(body.status,'rejected');
  assert.equal(DB.calls.some(x=>x.sql.includes('INSERT INTO agentic_events')),false,'lost proposal-decision races must not emit false audit events');
}

{
  const DB=mockDb();
  const headers=authedHeaders();headers.set('content-type','application/json');headers.set('content-encoding','gzip');
  const request=new Request('https://thebedesk.com/api/agentic/plan',{method:'POST',headers,body:'{}'});
  const response=await handleAgenticRequest({request,logicalPath:'/api/agentic/plan',env:envFor(DB),ctx:{},coreFetch:async()=>new Response('{}',{status:500})});
  assert.equal(response.status,415);
  assert.equal((await response.json()).error,'unsupported_content_encoding');
}

{
  const DB=mockDb();
  const headers=authedHeaders();headers.set('content-type','application/json');
  const request=new Request('https://thebedesk.com/api/agentic/plan',{method:'POST',headers,body:'{'});
  const response=await handleAgenticRequest({request,logicalPath:'/api/agentic/plan',env:envFor(DB),ctx:{},coreFetch:async()=>new Response('{}',{status:500})});
  assert.equal(response.status,400);
  assert.equal((await response.json()).error,'invalid_json');
}

{
  const DB=mockDb({role:'owner',proposal:{id:'p1',run_id:'r1',status:'approved'}});
  const {response,body}=await call({path:'/api/agentic/proposals/p1/approve',method:'POST',headers:authedHeaders(),DB});
  assert.equal(response.status,409);
  assert.equal(body.error,'agentic_proposal_already_decided');
  assert.equal(DB.calls.some(x=>x.sql.startsWith('UPDATE agentic_proposals')),false,'decisions are single-consumption');
}

console.log('V80 agentic runtime authorization gate: PASS');
