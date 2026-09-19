import assert from "node:assert/strict";
import fs from "node:fs";
import worker,{__v76Test} from "../cloudflare/src/worker.js";
import {classifyWhatsAppInboundCommand,normalizeWhatsAppInboundNumber,processWhatsAppInboundMessages} from "../cloudflare/src/whatsapp-inbound-core.js";

assert.equal(normalizeWhatsAppInboundNumber("71 234 567"),"+26771234567");
assert.equal(normalizeWhatsAppInboundNumber("26771234567"),"+26771234567");
assert.equal(normalizeWhatsAppInboundNumber("+27123456789"),null);
assert.equal(classifyWhatsAppInboundCommand("Thebe finance"),"finance_exception");
assert.equal(classifyWhatsAppInboundCommand("compliance"),"compliance_followup");
assert.equal(classifyWhatsAppInboundCommand("daily operations"),"operations_update");
assert.equal(classifyWhatsAppInboundCommand("tell me anything"),null);

function mockDb({bindings=[{tenant_id:"tenant-A",user_id:"u1",role:"owner"}]}={}){
  const calls=[];
  const DB={
    calls,
    prepare(sql){
      const call={sql,bindings:[]};calls.push(call);
      return {
        bind(...values){call.bindings=values;return this},
        async all(){
          if(sql.includes("FROM whatsapp_consents c"))return {results:bindings};
          return {results:[]};
        },
        async first(){
          if(sql.includes("FROM agent_action_intents ai"))return null;
          if(sql.includes("FROM finance_reconciliation_runs r JOIN finance_accounts"))return {id:"rec1",account_name:"Main account",statement_to:"2026-09-19",difference_minor:1250,created_at:"2026-09-19T20:00:00Z"};
          return null;
        },
        async run(){return {success:true,meta:{changes:1}}}
      };
    },
    async batch(statements){calls.push({sql:"__batch__",count:statements.length});return statements.map(()=>({success:true,meta:{changes:1}}))}
  };
  return DB;
}

{
  const DB=mockDb();
  const result=await processWhatsAppInboundMessages({DB,WHATSAPP_PHONE_NUMBER_ID:"12345"},[{
    phoneNumberId:"12345",
    message:{id:"wamid.finance.1",from:"26771234567",type:"text",timestamp:"1789862400",text:{body:"finance"}}
  }]);
  assert.equal(result.received,1);
  assert.equal(result.prepared,1);
  assert.equal(result.unlinked,0);
  const intent=DB.calls.find(call=>call.sql.includes("INSERT INTO agent_action_intents"));
  assert.ok(intent,"inbound command must create a governed action intent");
  assert.ok(intent.bindings.includes("thebe"),"inbound command must persist canonical Thebe agent identity");
  assert.ok(intent.bindings.includes("finance_brief.prepare"),"finance command must stay on the fixed finance prepare action");
  const run=DB.calls.find(call=>call.sql.includes("INSERT INTO agentic_runs"));
  assert.ok(run.bindings.some(value=>String(value).includes('"channel":"whatsapp_inbound"')),"inbound state must be recorded in the governed agent run");
  assert.equal(DB.calls.some(call=>String(call.sql).includes("notification_outbox")),false,"inbound preparation must not enqueue a WhatsApp send");
}

{
  const DB=mockDb();
  const secret="inbound-webhook-secret-long-enough";
  const raw=JSON.stringify({
    object:"whatsapp_business_account",
    entry:[{changes:[{value:{
      metadata:{phone_number_id:"12345"},
      messages:[{id:"wamid.webhook.finance.1",from:"26771234567",type:"text",timestamp:"1789862400",text:{body:"Thebe finance"}}]
    }}]}]
  });
  const signature=await __v76Test.signWhatsAppWebhookForTest(secret,raw);
  const response=await worker.fetch(new Request("https://thebedesk.com/api/webhooks/whatsapp",{
    method:"POST",
    headers:{"x-hub-signature-256":signature,"content-type":"application/json"},
    body:raw
  }),{DB,WHATSAPP_APP_SECRET:secret,WHATSAPP_PHONE_NUMBER_ID:"12345"},{});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.received,0,"inbound messages must not be miscounted as delivery statuses");
  assert.equal(body.inbound.received,1);
  assert.equal(body.inbound.prepared,1);
  assert.equal(body.inbound.replayed,0);
}

{
  const DB=mockDb({bindings:[
    {tenant_id:"tenant-A",user_id:"u1",role:"owner"},
    {tenant_id:"tenant-B",user_id:"u1",role:"owner"}
  ]});
  const result=await processWhatsAppInboundMessages({DB,WHATSAPP_PHONE_NUMBER_ID:"12345"},[{
    phoneNumberId:"12345",
    message:{id:"wamid.ambiguous.1",from:"26771234567",type:"text",timestamp:"1789862400",text:{body:"brief"}}
  }]);
  assert.equal(result.ambiguous,1);
  assert.equal(result.prepared,0);
  assert.equal(DB.calls.some(call=>call.sql.includes("INSERT INTO agentic_runs")),false,"ambiguous phone binding must fail closed before agent persistence");
}

{
  const DB=mockDb({bindings:[]});
  const result=await processWhatsAppInboundMessages({DB,WHATSAPP_PHONE_NUMBER_ID:"12345"},[{
    phoneNumberId:"12345",
    message:{id:"wamid.unlinked.1",from:"26771234567",type:"text",timestamp:"1789862400",text:{body:"brief"}}
  }]);
  assert.equal(result.unlinked,1);
  assert.equal(result.prepared,0);
}

{
  const DB=mockDb();
  const result=await processWhatsAppInboundMessages({DB,WHATSAPP_PHONE_NUMBER_ID:"12345"},[{
    phoneNumberId:"12345",
    message:{id:"wamid.unknown.1",from:"26771234567",type:"text",timestamp:"1789862400",text:{body:"please do an arbitrary thing"}}
  }]);
  assert.equal(result.unrecognized,1);
  assert.equal(result.prepared,0);
  assert.equal(DB.calls.some(call=>call.sql.includes("INSERT INTO agentic_runs")),false,"unrecognized free-form text must not reach the agent persistence path");
}

{
  const DB=mockDb();
  const result=await processWhatsAppInboundMessages({DB},[{
    phoneNumberId:"12345",
    message:{id:"wamid.no-config.1",from:"26771234567",type:"text",timestamp:"1789862400",text:{body:"finance"}}
  }]);
  assert.equal(result.wrongNumber,1);
  assert.equal(result.prepared,0);
  assert.equal(DB.calls.length,0,"missing configured WhatsApp phone-number ID must fail closed before account lookup");
}

{
  const DB=mockDb();
  const result=await processWhatsAppInboundMessages({DB,WHATSAPP_PHONE_NUMBER_ID:"12345"},[{
    phoneNumberId:"",
    message:{id:"wamid.no-metadata.1",from:"26771234567",type:"text",timestamp:"1789862400",text:{body:"finance"}}
  }]);
  assert.equal(result.wrongNumber,1);
  assert.equal(result.prepared,0);
  assert.equal(DB.calls.length,0,"missing webhook phone-number metadata must fail closed before account lookup");
}

const inboundSource=fs.readFileSync("cloudflare/src/whatsapp-inbound-core.js","utf8");
const workerSource=fs.readFileSync("cloudflare/src/worker.js","utf8");
const agenticSource=fs.readFileSync("cloudflare/src/agentic-whatsapp-core.js","utf8");
for(const forbidden of ["WHATSAPP_ACCESS_TOKEN","graph.facebook.com","notification_outbox","enqueueWhatsAppNotification"]){
  assert.equal(inboundSource.includes(forbidden),false,`inbound layer must not contain ${forbidden}`);
}
assert.doesNotMatch(inboundSource,/\bfetch\s*\(/,"inbound layer must not perform outbound network I/O");
assert.match(inboundSource,/m\.role IN \('owner','manager'\)/,"inbound account binding must be role-bounded");
assert.match(inboundSource,/matches\.length!==1/,"ambiguous account binding must fail closed");
assert.match(inboundSource,/sourceContext:\{providerMessageId,receivedAt:/,"provider message identity must bind idempotent preparation without storing arbitrary raw text");
assert.match(workerSource,/processWhatsAppInboundMessages/,"signed Meta webhook path must hand inbound messages to the governed intake layer");
assert.match(workerSource,/if\(!messages\.length\)return base/,"status-only webhook responses must preserve the existing V76 response contract");
assert.match(agenticSource,/export async function prepareWhatsAppPurposeForPrincipal/,"app and inbound WhatsApp must share one governed preparation implementation");
assert.match(agenticSource,/sourceName==="whatsapp_inbound"/,"shared preparation must mark inbound state explicitly");
assert.doesNotMatch(agenticSource,/WHATSAPP_ACCESS_TOKEN/,"shared agentic preparation must remain provider-credential blind");

console.log("v93 governed inbound WhatsApp -> single Thebe preparation: PASS");
