import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {AGENT_ACTION_CATALOG,AGENT_ACTION_LEVELS} from "../cloudflare/src/agent-policy.js";
import {financeReceivableCustomerLookup} from "../cloudflare/src/finance-receivables.js";
import {classifyWhatsAppInboundIntent} from "../cloudflare/src/whatsapp-inbound-core.js";
import {__whatsappAgenticTest} from "../cloudflare/src/agentic-whatsapp-core.js";
import {__agentReadToolsTest} from "../cloudflare/src/agent-read-tools.js";

for(const path of [
  "cloudflare/src/finance-receivables.js",
  "cloudflare/src/agent-policy.js",
  "cloudflare/src/agent-read-tools.js",
  "cloudflare/src/agentic-whatsapp-core.js",
  "cloudflare/src/whatsapp-inbound-core.js"
])execFileSync(process.execPath,["--check",path],{stdio:"pipe"});

const policy=AGENT_ACTION_CATALOG["receivables_customer.read"];
assert.ok(policy);
assert.equal(policy.level,AGENT_ACTION_LEVELS.READ);
assert.equal(policy.phase1Enabled,true);
assert.equal(policy.externalSideEffect,false);
assert.equal(policy.authoritativeSource,"finance_invoices_plus_transaction_allocations");
assert.ok(__agentReadToolsTest.PARAMETERIZED_TOOL_ACTIONS.includes("receivables_customer.read"));
assert.ok(!__agentReadToolsTest.TOOL_ACTIONS.includes("receivables_customer.read"),"parameterized customer lookup must not run in broad agent context without a query");

assert.deepEqual(
  classifyWhatsAppInboundIntent("How much does Alpha Trading owe us?"),
  {kind:"read",readKey:"receivable_customer",params:{customerQuery:"alpha trading"}}
);
assert.deepEqual(
  classifyWhatsAppInboundIntent("Customer balance for CUST-001"),
  {kind:"read",readKey:"receivable_customer",params:{customerQuery:"cust-001"}}
);
assert.deepEqual(
  classifyWhatsAppInboundIntent("Which customers still owe us?"),
  {kind:"read",readKey:"receivables"}
);

function dbFor(matches){
  const calls=[];
  return {
    calls,
    DB:{
      prepare(sql){
        const call={sql,bindings:[]};calls.push(call);
        return {
          bind(...bindings){
            call.bindings=bindings;
            return {
              async all(){
                if(sql.includes("FROM finance_customers"))return {results:matches};
                if(sql.includes("FROM open_invoices WHERE customer_id=?"))return {results:[
                  {id:"inv-1",invoice_number:"INV-001",issued_on:"2026-08-01",due_on:"2026-09-01",total_minor:100000,allocated_minor:60000,outstanding_minor:40000,overdue:1}
                ]};
                return {results:[]};
              },
              async first(){
                if(sql.includes("MIN(due_on) earliest_due_on"))return {
                  outstanding_invoice_count:1,outstanding_minor:40000,overdue_invoice_count:1,overdue_minor:40000,earliest_due_on:"2026-09-01"
                };
                return null;
              }
            };
          }
        };
      }
    }
  };
}

const resolvedDb=dbFor([{id:"c1",customer_code:"CUST-001",name:"Alpha Trading"}]);
const resolved=await financeReceivableCustomerLookup({DB:resolvedDb.DB},"tenant-a",{customerQuery:"Alpha Trading",businessDate:"2026-09-23"});
assert.equal(resolved.state,"resolved");
assert.equal(resolved.customer.customerId,"c1");
assert.equal(resolved.outstandingMinor,40000);
assert.equal(resolved.overdueMinor,40000);
assert.equal(resolved.invoices[0].invoiceNumber,"INV-001");
assert.equal(resolved.authority.matchPolicy,"exact_customer_name_or_code_only");
assert.ok(resolvedDb.calls.every(call=>call.bindings.includes("tenant-a")),"every customer-balance query must remain tenant-scoped");

const missingDb=dbFor([]);
const missing=await financeReceivableCustomerLookup({DB:missingDb.DB},"tenant-a",{customerQuery:"Missing Customer",businessDate:"2026-09-23"});
assert.equal(missing.state,"not_found");

const ambiguousDb=dbFor([
  {id:"c1",customer_code:"A-1",name:"Same Name"},
  {id:"c2",customer_code:"A-2",name:"Same Name"}
]);
const ambiguous=await financeReceivableCustomerLookup({DB:ambiguousDb.DB},"tenant-a",{customerQuery:"Same Name",businessDate:"2026-09-23"});
assert.equal(ambiguous.state,"ambiguous");
assert.equal(ambiguous.matchCount,2);

const reply=__whatsappAgenticTest.buildReadReply("receivable_customer",{data:resolved});
assert.match(reply,/Alpha Trading/);
assert.match(reply,/P400/);
assert.match(reply,/exact customer matching only/i);
assert.match(__whatsappAgenticTest.buildReadReply("receivable_customer",{data:missing}),/will not guess/i);
assert.match(__whatsappAgenticTest.buildReadReply("receivable_customer",{data:ambiguous}),/exact customer code|unique full customer name/i);

const whatsapp=fs.readFileSync("cloudflare/src/agentic-whatsapp-core.js","utf8");
const inbound=fs.readFileSync("cloudflare/src/whatsapp-inbound-core.js","utf8");
const readTools=fs.readFileSync("cloudflare/src/agent-read-tools.js","utf8");
const receivables=fs.readFileSync("cloudflare/src/finance-receivables.js","utf8");
assert.match(inbound,/readParams:intent\.params\|\|null/);
assert.match(whatsapp,/params,source,providerMessageId/);
assert.match(whatsapp,/financeMutation:false/);
assert.match(whatsapp,/customerMessage:false/);
assert.match(inbound,/readKey:"receivable_customer"/);
assert.match(receivables,/lower\(name\)=\?/);
assert.match(receivables,/lower\(COALESCE\(customer_code,''\)\)=\?/);
assert.match(receivables,/LIMIT 3/);
assert.doesNotMatch(readTools,/\bfetch\s*\(/);
assert.doesNotMatch(readTools,/\b(INSERT|UPDATE|DELETE|REPLACE)\b/i);

console.log("v109 exact customer receivable read: 3-pass governed boundary PASS");
