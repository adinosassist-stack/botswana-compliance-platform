import assert from "node:assert/strict";
import {
  classifyWhatsAppInboundIntent,
  processWhatsAppInboundMessages
} from "../cloudflare/src/whatsapp-inbound-core.js";

assert.deepEqual(classifyWhatsAppInboundIntent("Thebe cash position"),{kind:"read",readKey:"cash_position"});
assert.deepEqual(classifyWhatsAppInboundIntent("How much did we collect today?"),{kind:"read",readKey:"finance_inflows_today"});
assert.deepEqual(classifyWhatsAppInboundIntent("Is our finance data up to date?"),{kind:"read",readKey:"finance_data_quality"});
assert.deepEqual(classifyWhatsAppInboundIntent("Which customers still owe us?"),{kind:"unavailable",reason:"receivables"});
assert.equal(classifyWhatsAppInboundIntent("do something random"),null);

function mockDb(){
  const calls=[];
  return {
    calls,
    prepare(sql){
      const call={sql,bindings:[]};calls.push(call);
      return {
        bind(...bindings){call.bindings=bindings;return this},
        async all(){
          if(sql.includes("FROM whatsapp_consents c"))return {results:[{tenant_id:"tenant-A",user_id:"u1",role:"owner"}]};
          return {results:[]};
        },
        async first(){
          if(sql.includes("FROM agent_action_intents ai"))return null;
          if(sql.includes("positive_inflow_minor"))return {positive_inflow_minor:45500,positive_inflow_count:3,outflow_minor:1000,outflow_count:1};
          return null;
        },
        async run(){return {success:true,meta:{changes:1}}}
      };
    },
    async batch(statements){calls.push({sql:"__batch__",count:statements.length});return statements.map(()=>({success:true,meta:{changes:1}}))}
  };
}

{
  const DB=mockDb(),deliveries=[];
  const result=await processWhatsAppInboundMessages({DB,WHATSAPP_PHONE_NUMBER_ID:"12345"},[{
    phoneNumberId:"12345",
    message:{id:"wamid.inflow.1",from:"26771234567",type:"text",timestamp:"1789862400",text:{body:"How much did we collect today?"}}
  }],{deliverReply:async reply=>{deliveries.push(reply);return {ok:true,id:"n1"}}});
  assert.equal(result.answered,1);
  assert.equal(result.replyQueued,1);
  assert.equal(result.reconciliationPrepared,0);
  assert.equal(deliveries.length,1);
  assert.equal(deliveries[0].to,"+26771234567");
  assert.equal(deliveries[0].userId,"u1");
  assert.equal(deliveries[0].replyToMessageId,"wamid.inflow.1");
  assert.match(deliveries[0].text,/recorded positive inflows/i);
  assert.match(deliveries[0].text,/not.*all customer collections/i);
  assert.ok(DB.calls.some(call=>call.sql==="__batch__"),"governed read must atomically persist run, intent and audit event");
  assert.equal(DB.calls.some(call=>/INSERT INTO finance_|UPDATE finance_|DELETE FROM finance_/i.test(String(call.sql))),false,"read query must not mutate finance");
}

{
  const DB=mockDb(),deliveries=[];
  const result=await processWhatsAppInboundMessages({DB,WHATSAPP_PHONE_NUMBER_ID:"12345"},[{
    phoneNumberId:"12345",
    message:{id:"wamid.receivable.1",from:"26771234567",type:"text",timestamp:"1789862400",text:{body:"Which customers still owe us?"}}
  }],{deliverReply:async reply=>{deliveries.push(reply);return {ok:true,id:"n2"}}});
  assert.equal(result.guidance,1);
  assert.equal(result.replyQueued,1);
  assert.equal(deliveries.length,1);
  assert.match(deliveries[0].text,/does not have an authoritative invoices\/receivables ledger/i);
  assert.equal(DB.calls.some(call=>String(call.sql).includes("finance_transactions")),false,"receivables gap must not be guessed from bank transactions");
}

console.log("v107 pass 1: WhatsApp finance read routing and fail-closed receivables PASS");
