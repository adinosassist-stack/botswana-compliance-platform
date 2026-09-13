import fs from "node:fs";
import assert from "node:assert/strict";

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const ui=read("public/js/owner-whatsapp-prepare.js");
const apiClient=read("public/js/api-client.js");
const server=read("cloudflare/src/agentic-whatsapp-core.js");
let checks=0;
const ok=(value,message)=>{assert.ok(value,message);checks++};

for(const purpose of ["owner_daily_brief","finance_exception","compliance_followup","operations_update"]){
  ok(ui.includes(`key:"${purpose}"`),`${purpose} is an explicit browser purpose`);
}

ok(apiClient.includes('script.src="/js/owner-whatsapp-prepare.js"'),'hardened same-origin API bootstrap loads the companion UI');
ok(apiClient.includes('data-thebe-owner-whatsapp-prepare')||apiClient.includes('thebeOwnerWhatsappPrepare'),'companion loader prevents duplicate mounting');
ok(ui.includes('request("/api/agentic/whatsapp/status")'),'UI verifies prepare-only capability before enabling mutation');
ok(ui.includes('request("/api/agentic/whatsapp/prepare"'),'UI uses the governed prepare endpoint');
ok(ui.includes('method:"POST"'),'draft preparation is an explicit mutation');
ok(ui.includes('headers:{"idempotency-key":makeIdempotencyKey()}'),'draft preparation carries a unique idempotency key');
ok(ui.includes('body:JSON.stringify({purpose})'),'browser submits only the governed purpose');
ok(ui.includes('typeof global.apiJson!=="function"'),'browser requires hardened apiJson transport');
ok(!/\bfetch\s*\(/.test(ui),'companion UI performs no raw network fetch');

ok(ui.includes('payload?.mode!=="prepare_only"'),'capability validation requires prepare-only mode');
ok(ui.includes('payload?.humanReviewRequired!==true'),'capability validation requires human review');
ok(ui.includes('payload?.providerSend!==false'),'capability validation requires provider send disabled');
ok(ui.includes('payload?.recipientTargeting!==false'),'capability validation requires recipient targeting disabled');
ok(ui.includes('payload?.executionEnabled!==false'),'capability validation requires execution disabled');
ok(ui.includes('payload?.execution?.performed===false'),'prepared response must prove nothing executed');
ok(ui.includes('payload?.execution?.enabled===false'),'prepared response must prove execution remains disabled');
ok(ui.includes('payload?.execution?.providerSend===false'),'prepared response must prove provider send remains disabled');
ok(ui.includes('payload?.execution?.recipientTargeting===false'),'prepared response must prove no recipient targeting');

ok(ui.includes('preview.readOnly=true'),'prepared draft preview is read-only');
ok(ui.includes('global.navigator.clipboard.writeText(currentDraft)'),'manual copy is the only transfer action');
ok(ui.includes('copyDraftButton.textContent="Copy reviewed draft"'),'copy action is explicitly review-oriented');
ok(ui.includes('Thebe Desk did not send anything.'),'UI states that copy does not send');
ok(ui.includes('No recipient targeting · no automatic sending · every draft requires your review.'),'human boundary is visible in the panel');
ok(ui.includes('["owner","manager"].includes(role())'),'browser panel is role-gated to Owner/Manager');

for(const forbidden of ["WHATSAPP_ACCESS_TOKEN","WHATSAPP_PHONE_NUMBER_ID","graph.facebook.com","notification_outbox","phone_e164"]){
  ok(!ui.includes(forbidden),`UI cannot access ${forbidden}`);
}
ok(!ui.includes('href="https://wa.me')&&!ui.includes("wa.me/"),'UI cannot launch a recipient-addressed WhatsApp link');
ok(!ui.includes('window.open('),'UI cannot open an outbound messaging window');
ok(!ui.includes('/messages'),'UI contains no provider message endpoint');
ok(!ui.includes('.innerHTML='),'UI renders draft text without direct innerHTML assignment');

ok(server.includes('mode:"prepare_only"'),'server continues to declare prepare-only mode');
ok(server.includes('providerSend:false')&&server.includes('recipientTargeting:false'),'server continues to disable provider send and recipient targeting');
ok(server.includes('status:"review_required"'),'server persists review-required intent status');

console.log(`V82 WhatsApp Owner Command Centre gate: ${checks}/${checks} PASS`);
