import assert from "node:assert/strict";
import fs from "node:fs";
import {__v76Test} from "../cloudflare/src/worker.js";

const request=__v76Test.buildWhatsAppSessionReplyRequest({
  payload_json:JSON.stringify({body:"Recorded cash position: P1000",replyToMessageId:"wamid.inbound.1"})
},"+26771234567");
assert.equal(request.messaging_product,"whatsapp");
assert.equal(request.recipient_type,"individual");
assert.equal(request.to,"26771234567");
assert.equal(request.context.message_id,"wamid.inbound.1");
assert.equal(request.type,"text");
assert.equal(request.text.body,"Recorded cash position: P1000");
assert.equal(request.text.preview_url,false);

const inbound=fs.readFileSync("cloudflare/src/whatsapp-inbound-core.js","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const agentic=fs.readFileSync("cloudflare/src/agentic-whatsapp-core.js","utf8");

for(const forbidden of ["WHATSAPP_ACCESS_TOKEN","graph.facebook.com","externalFetch(","notification_outbox"]){
  assert.equal(inbound.includes(forbidden),false,"inbound router must remain provider/network blind: "+forbidden);
}
assert.match(worker,/WHATSAPP_SESSION_REPLY_TEMPLATE_KEY="__thebe_agent_reply"/);
assert.match(worker,/agent-reply:\$\{providerMessageId\}/,"provider inbound message ID must dedupe the queued reply");
assert.match(worker,/consentPhone!==phone/,"queue boundary must lock the recipient to the consented inbound phone");
assert.match(worker,/expectedPhoneHash/,"delivery boundary must retain a phone hash lock");
assert.match(worker,/String\(payload\.expectedPhoneHash\|\|""\)!==await sha256Hex\(phone\)/,"send boundary must reverify the phone lock");
assert.match(worker,/context:\{message_id:replyToMessageId\}/,"session reply must quote the exact inbound message");
assert.match(worker,/notification_delivery_attempts/,"session replies must reuse delivery-attempt tracking");
assert.match(worker,/whatsapp_delivery_events/,"session replies must reuse signed delivery-status tracking");
assert.match(worker,/deliveryPolicy:"inbound_response"/);
assert.match(worker,/inQuietHours\(pref\)[\s\S]*WHATSAPP_SESSION_REPLY_TEMPLATE_KEY/,"inbound responses must not be delayed as unsolicited quiet-hours notifications");
assert.doesNotMatch(agentic,/WHATSAPP_ACCESS_TOKEN|graph\.facebook\.com|externalFetch\(/,"single-agent finance reasoning must remain provider-credential blind");
assert.doesNotMatch(inbound,/reminder\.send|document\.request|payment\.execute|journal_entry\.post/,"inbound finance chat must not expose consequential customer or money actions");

console.log("v107 pass 3: consent-bound WhatsApp reply transport and delivery ledger PASS");
