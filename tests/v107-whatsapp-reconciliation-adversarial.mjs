import assert from "node:assert/strict";
import fs from "node:fs";
import {
  parseWhatsAppReconciliationRequest,
  processWhatsAppInboundMessages
} from "../cloudflare/src/whatsapp-inbound-core.js";

const parsed=parseWhatsAppReconciliationRequest(
  "Thebe reconcile yesterday opening P1,000.50 closing P1,250",
  {now:new Date("2026-09-23T10:00:00Z")}
);
assert.equal(parsed.statementFrom,"2026-09-22");
assert.equal(parsed.statementTo,"2026-09-22");
assert.equal(parsed.openingBalanceMinor,100050);
assert.equal(parsed.closingBalanceMinor,125000);

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
          if(sql.includes("SELECT id,name FROM finance_accounts"))return {results:[{id:"acc-1",name:"Main Bank"}]};
          if(sql.includes("SELECT id,posted_on,amount_minor,source_fingerprint FROM finance_transactions"))return {results:[
            {id:"t1",posted_on:"2026-09-22",amount_minor:25000,source_fingerprint:"fp1"}
          ]};
          return {results:[]};
        },
        async first(){
          if(sql.includes("FROM agent_action_intents ai"))return null;
          if(sql.includes("SELECT id,name FROM finance_accounts WHERE id=?"))return {id:"acc-1",name:"Main Bank"};
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
    message:{id:"wamid.reconcile.1",from:"26771234567",type:"text",timestamp:"1789862400",text:{body:"Thebe reconcile yesterday opening P1000 closing P1250"}}
  }],{deliverReply:async reply=>{deliveries.push(reply);return {ok:true,id:"n3"}}});
  assert.equal(result.reconciliationPrepared,1);
  assert.equal(result.replyQueued,1);
  assert.equal(deliveries.length,1);
  assert.match(deliveries[0].text,/reconciliation prepared/i);
  assert.match(deliveries[0].text,/nothing was recorded, posted or sent/i);
  assert.equal(DB.calls.some(call=>/INSERT INTO finance_reconciliation_runs/i.test(String(call.sql))),false,"WhatsApp prepare must never record a reconciliation");
  assert.equal(DB.calls.some(call=>/notification_outbox/i.test(String(call.sql))),false,"canonical reconciliation preparation must not send a business alert");
}

{
  const DB=mockDb(),deliveries=[];
  const result=await processWhatsAppInboundMessages({DB,WHATSAPP_PHONE_NUMBER_ID:"12345"},[{
    phoneNumberId:"12345",
    message:{id:"wamid.reconcile.missing",from:"26771234567",type:"text",timestamp:"1789862400",text:{body:"Reconcile yesterday"}}
  }],{deliverReply:async reply=>{deliveries.push(reply);return {ok:true,id:"n4"}}});
  assert.equal(result.guidance,1);
  assert.equal(result.reconciliationPrepared,0);
  assert.match(deliveries[0].text,/will not guess missing statement inputs/i);
  assert.equal(DB.calls.some(call=>/SELECT id,posted_on,amount_minor,source_fingerprint FROM finance_transactions/i.test(String(call.sql))),false,"missing balances must stop before ledger reconciliation");
}

const inbound=fs.readFileSync("cloudflare/src/whatsapp-inbound-core.js","utf8");
const agentic=fs.readFileSync("cloudflare/src/agentic-whatsapp-core.js","utf8");
const finance=fs.readFileSync("cloudflare/src/agentic-finance-reconciliation.js","utf8");
assert.match(agentic,/prepareFinanceReconciliationForPrincipal/,"WhatsApp must reuse the canonical guarded finance preparation function");
assert.doesNotMatch(agentic,/INSERT INTO finance_reconciliation_runs/,"WhatsApp adapter must not gain a second finance write path");
assert.doesNotMatch(inbound,/INSERT INTO finance_reconciliation_runs/,"inbound router must not write reconciliation records");
assert.match(finance,/evaluateAgentRuntimeGuard/);
assert.match(finance,/prepareFinanceReconciliationSnapshot/);
assert.match(finance,/writesToFinanceCore:false/);

console.log("v107 pass 2: WhatsApp reconciliation canonical-guard integration PASS");
