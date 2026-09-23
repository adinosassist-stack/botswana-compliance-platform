import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {classifyWhatsAppInboundIntent} from "../cloudflare/src/whatsapp-inbound-core.js";

assert.deepEqual(
  classifyWhatsAppInboundIntent("Which customers still owe us?"),
  {kind:"read",readKey:"receivables"}
);
assert.deepEqual(
  classifyWhatsAppInboundIntent("Show overdue invoices"),
  {kind:"read",readKey:"receivables"}
);
assert.deepEqual(
  classifyWhatsAppInboundIntent("What is our cash position?"),
  {kind:"read",readKey:"cash_position"}
);
assert.deepEqual(
  classifyWhatsAppInboundIntent("How much did we collect today?"),
  {kind:"read",readKey:"finance_inflows_today"}
);

const inbound=fs.readFileSync("cloudflare/src/whatsapp-inbound-core.js","utf8");
const whatsapp=fs.readFileSync("cloudflare/src/agentic-whatsapp-core.js","utf8");
const readTools=fs.readFileSync("cloudflare/src/agent-read-tools.js","utf8");
const policy=fs.readFileSync("cloudflare/src/agent-policy.js","utf8");

for(const path of [
  "cloudflare/src/whatsapp-inbound-core.js",
  "cloudflare/src/agentic-whatsapp-core.js",
  "cloudflare/src/agent-read-tools.js",
  "cloudflare/src/agent-policy.js"
]){
  execFileSync(process.execPath,["--check",path],{stdio:"pipe"});
}

assert.match(inbound,/readKey:"receivables"/);
assert.doesNotMatch(inbound,/kind:"unavailable",reason:"receivables"/);
assert.match(whatsapp,/receivables:Object\.freeze\(\{actionKey:"receivables_summary\.read"/);
assert.match(whatsapp,/customer receivables/i);
assert.match(whatsapp,/Largest recorded balances/);
assert.match(whatsapp,/Balances are derived from issued invoices less explicit allocations/);
assert.match(whatsapp,/Invoice-linked customer collections/);
assert.match(whatsapp,/Unclassified positive inflows/);

assert.match(readTools,/"receivables_summary\.read"/);
assert.match(readTools,/financeReceivablesSummary/);
assert.match(readTools,/financeDailyCollections/);
assert.doesNotMatch(readTools,/\b(INSERT|UPDATE|DELETE|REPLACE)\s+(INTO|FROM|\w+)/i);
assert.doesNotMatch(readTools,/\bfetch\s*\(/);

assert.match(policy,/"receivables_summary\.read": action/);
assert.match(policy,/authoritativeSource:"finance_invoices_plus_transaction_allocations"/);
assert.doesNotMatch(whatsapp,/customer_reminder|journal_entry\.prepare|payment\.execute/i);
assert.match(whatsapp,/financeMutation:false/);
assert.match(whatsapp,/customerMessage:false/);

console.log("v108 WhatsApp receivables: governed single-agent read boundary PASS");
