import assert from "node:assert/strict";
import {handleAgenticRequest} from "../cloudflare/src/agentic-core.js";
import {executeAgentReadTool} from "../cloudflare/src/agent-read-tools.js";
import {verifyOrchestratedProposals} from "../cloudflare/src/agent-orchestration.js";

function database(){
  const calls=[];
  return {calls,prepare(sql){
    calls.push(sql);
    return {bind(){return this},async first(){
      if(sql.includes("FROM sessions s"))return {user_id:"u1",tenant_id:"tenant-A",csrf_token:"csrf-A",role:"owner"};
      return null;
    },async all(){return {results:[]}},async run(){return {success:true,meta:{changes:1}}}};
  },async batch(statements){return statements.map(()=>({success:true,meta:{changes:1}}))}};
}
const environment=DB=>({DB,SESSION_SECRET:"x".repeat(32),PUBLIC_ORIGIN:"https://thebedesk.com",PUBLIC_APP_URL:"https://thebedesk.com"});
function request(path,method="GET",body){
  return new Request(`https://thebedesk.com${path}`,{method,headers:{cookie:"bw_session=session-token",origin:"https://thebedesk.com","x-csrf-token":"csrf-A","content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
}

// The complete planner must honour the public advisor request limit, even with a
// maximum-size goal and a workspace whose evidence is assembled separately.
{
  const DB=database();let advisorCalls=0;
  const goal="Review cash and compliance. ".repeat(30).slice(0,500);
  const response=await handleAgenticRequest({request:request("/api/agentic/plan","POST",{goal}),env:environment(DB),coreFetch:async req=>{
    advisorCalls++;
    const body=await req.json();
    assert.ok(body.question.length<=1000,"internal plan must fit the advisor's 1000-character question contract");
    assert.ok(body.question.includes(goal),"preserve the complete user goal");
    assert.equal(body.mode,"next_actions");
    return Response.json({generationMode:"workers_ai",result:{answer:"Review recorded evidence before acting.",confidence:"low",actions:[]}});
  }});
  const body=await response.json();
  assert.equal(advisorCalls,1);
  assert.equal(body.run.generationMode,"governed_ai_advisor");
  assert.equal(response.status,201);
}

for(const flags of [{AGENT_RUNTIME_KILL_SWITCH:"1"},{AGENT_RUNTIME_ENABLED:"0"},{AGENT_RUNTIME_BUDGET_STATUS:"exceeded"}]){
  for(const path of ["/api/agentic/tools/read/financial_position.read","/api/agentic/plan","/api/agentic/runs/prior/continue"]){
    const DB=database();let advisorCalls=0;
    const planning=path.endsWith("/plan")||path.endsWith("/continue");
    const response=await handleAgenticRequest({request:request(path,planning?"POST":"GET",planning?{goal:"Review cash"}:undefined),env:{...environment(DB),...flags},coreFetch:async()=>{advisorCalls++;return Response.json({})}});
    assert.equal(response.status,403,JSON.stringify({flags,path}));
    assert.equal(advisorCalls,0);
    assert.ok(DB.calls.every(sql=>sql.includes("FROM sessions s")),"stopped requests must not read business data or persist plans");
  }
  const DB=database();
  const result=await executeAgentReadTool("financial_position.read",{env:{DB,...flags},auth:{tenant_id:"tenant-A",role:"owner"}});
  assert.equal(result.allowed,false,"internal callers must also honour runtime controls");
  assert.equal(DB.calls.length,0);
}

{
  const result=verifyOrchestratedProposals([{title:"Your cash is P999,999",reason:"Invented amount",sourceRefs:["tool:financial_position"],risk:"low",authority:"recommendation_only"}],{allowedSourceRefs:["tool:financial_position"]});
  const verification=result.proposals[0].verification;
  assert.notEqual(verification.status,"verified_recommendation");
  assert.equal(verification.grounded,false,"an allowed reference cannot verify an invented claim");
  assert.equal(verification.claimsVerified,false);
  assert.equal(verification.sourceRefsValidated,true);
  assert.equal(verification.humanReviewRequired,true);
  assert.equal(result.summary.allGrounded,false);
}
console.log("AI audit regressions: PASS");
