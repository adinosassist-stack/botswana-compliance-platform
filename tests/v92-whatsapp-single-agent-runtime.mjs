import assert from "node:assert/strict";
import {handleAgenticWhatsAppRequest,__whatsappAgenticTest} from "../cloudflare/src/agentic-whatsapp-core.js";

for(const [purpose,spec] of Object.entries(__whatsappAgenticTest.ACTION_KEY_BY_PURPOSE)){
  assert.equal(spec.agentKey,"thebe",`${purpose} must use the canonical Thebe agent`);
}

function mockDb(){
  const calls=[];
  return {
    calls,
    prepare(sql){
      const call={sql,bindings:[]};calls.push(call);
      return {
        bind(...bindings){call.bindings=bindings;return this},
        async first(){
          if(sql.includes("FROM sessions s"))return {user_id:"u1",tenant_id:"tenant-A",csrf_token:"csrf-A",role:"owner"};
          if(sql.includes("FROM agent_action_intents ai"))return null;
          if(sql.includes("FROM finance_accounts a"))return {cash_position_minor:123450,account_count:2};
          if(sql.includes("FROM finance_reconciliation_runs WHERE"))return {exception_count:1,exposure_minor:5000,latest_reconciliation_at:"2026-09-19T18:00:00Z"};
          if(sql.includes("FROM compliance_obligations WHERE"))return {overdue_count:1,due_14d_count:2};
          if(sql.includes("FROM workflow_jobs WHERE"))return {pending_count:3,failed_count:0};
          if(sql.includes("FROM performance_insights"))return {critical_count:1};
          return null;
        },
        async run(){return {success:true,meta:{changes:1}}}
      };
    },
    async batch(statements){
      calls.push({sql:"__batch__",count:statements.length});
      return statements.map(()=>({success:true,meta:{changes:1}}));
    }
  };
}

const DB=mockDb();
const headers=new Headers({
  cookie:"bw_session=session-token",
  origin:"https://thebedesk.com",
  "x-csrf-token":"csrf-A",
  "content-type":"application/json",
  "idempotency-key":"whatsapp-single-agent-runtime-1"
});
const request=new Request("https://thebedesk.com/api/agentic/whatsapp/prepare",{
  method:"POST",
  headers,
  body:JSON.stringify({purpose:"owner_daily_brief"})
});
const response=await handleAgenticWhatsAppRequest({
  request,
  logicalPath:"/api/agentic/whatsapp/prepare",
  env:{DB,SESSION_SECRET:"x".repeat(32),PUBLIC_ORIGIN:"https://thebedesk.com"}
});
assert.equal(response.status,201);
const body=await response.json();
assert.equal(body.ok,true);
assert.equal(body.intent.agentKey,"thebe");
assert.equal(body.intent.actionKey,"management_brief.prepare");
assert.equal(body.intent.status,"review_required");
assert.equal(body.policy.prepareOnly,true);
assert.equal(body.policy.humanReviewRequired,true);
assert.deepEqual(body.execution,{performed:false,enabled:false,providerSend:false,recipientTargeting:false});
assert.ok(body.messagePreview.includes("Thebe Desk owner brief"));
assert.ok(DB.calls.some(call=>call.sql==="__batch__"&&call.count===3),"prepare must atomically persist run, intent and audit event");
assert.ok(DB.calls.some(call=>String(call.sql).includes("INSERT INTO agent_action_intents"))||DB.calls.some(call=>call.sql==="__batch__"),"prepare persistence path must be exercised");

console.log("v92 WhatsApp canonical single-agent runtime: PASS");
