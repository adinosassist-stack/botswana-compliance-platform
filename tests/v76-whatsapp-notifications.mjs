import assert from "node:assert/strict";
import fs from "node:fs";
import worker,{ __v76Test } from "../cloudflare/src/worker.js";

const workerSource=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const schema=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const migration=fs.readFileSync(new URL("../cloudflare/migrations/018_v76_whatsapp_notifications.sql",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const envExample=fs.readFileSync(new URL("../.env.example",import.meta.url),"utf8");

assert.equal(__v76Test.normalizeBotswanaWhatsappNumber("71 234 567"),"+26771234567");
assert.equal(__v76Test.normalizeBotswanaWhatsappNumber("267-71-234-567"),"+26771234567");
assert.equal(__v76Test.normalizeBotswanaWhatsappNumber("+26771234567"),"+26771234567");
assert.equal(__v76Test.normalizeBotswanaWhatsappNumber("+26731234567"),null);
assert.equal(__v76Test.normalizeBotswanaWhatsappNumber("+27123456789"),null);

const templateEnv={
  WHATSAPP_TEMPLATE_MAP_JSON:JSON.stringify({
    obligation_due:{name:"bw_obligation_due",language:"en_US"}
  })
};
const message=__v76Test.buildWhatsAppTemplateRequest(templateEnv,{
  template_key:"obligation_due",
  payload_json:JSON.stringify({title:"Annual return",dueAt:"2026-09-30",level:"urgent"})
},"+26771234567");
assert.deepEqual(message,{
  messaging_product:"whatsapp",
  to:"26771234567",
  type:"template",
  template:{
    name:"bw_obligation_due",
    language:{code:"en_US"},
    components:[{type:"body",parameters:[
      {type:"text",text:"Annual return"},
      {type:"text",text:"2026-09-30"},
      {type:"text",text:"urgent"}
    ]}]
  }
});
assert.throws(()=>__v76Test.buildWhatsAppTemplateRequest(templateEnv,{template_key:"unknown",payload_json:"{}"},"+26771234567"),/template_not_configured/);

const raw=JSON.stringify({object:"whatsapp_business_account",entry:[]});
const secret="test-app-secret-that-is-long-enough";
const signature=await __v76Test.signWhatsAppWebhookForTest(secret,raw);
assert.equal(await __v76Test.verifyWhatsAppWebhookSignature(signature,secret,raw),true);
assert.equal(await __v76Test.verifyWhatsAppWebhookSignature(signature,secret,raw+"x"),false);
assert.equal(__v76Test.shouldAdvanceWhatsAppStatus("read","delivered"),false);
assert.equal(__v76Test.shouldAdvanceWhatsAppStatus("sent","delivered"),true);
assert.equal(__v76Test.botswanaMonthKey(new Date("2026-08-31T22:30:00Z")),"2026-09");

const verifyEnv={WHATSAPP_VERIFY_TOKEN:secret,WHATSAPP_APP_SECRET:secret};
const challenge=await worker.fetch(new Request(`https://app.example/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(secret)}&hub.challenge=123456`),verifyEnv,{});
assert.equal(challenge.status,200);
assert.equal(await challenge.text(),"123456");
const rejected=await worker.fetch(new Request("https://app.example/api/webhooks/whatsapp",{method:"POST",headers:{"x-hub-signature-256":"sha256=bad"},body:raw}),verifyEnv,{});
assert.equal(rejected.status,401);
const accepted=await worker.fetch(new Request("https://app.example/api/webhooks/whatsapp",{method:"POST",headers:{"x-hub-signature-256":signature},body:raw}),verifyEnv,{});
assert.equal(accepted.status,200);
assert.deepEqual(await accepted.json(),{ok:true,received:0,recorded:0,updated:0,failed:0,unknown:0});

const checks=[
  ["public webhook GET and POST",workerSource.includes('/api/webhooks/whatsapp')&&workerSource.includes('x-hub-signature-256')],
  ["consent API",workerSource.includes('/api/notification-channels/whatsapp')&&workerSource.includes('WHATSAPP_CONSENT_RECORDED')&&workerSource.includes('WHATSAPP_CONSENT_REVOKED')],
  ["Meta Cloud API transport",workerSource.includes('graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages')&&workerSource.includes('meta_whatsapp_cloud')],
  ["status webhook idempotency",workerSource.includes('whatsapp_delivery_events')&&workerSource.includes('INSERT OR IGNORE INTO whatsapp_delivery_events')],
  ["automated manager fanout",workerSource.includes('enqueueTenantAlert')&&workerSource.includes('whatsappRecipients')],
  ["atomic outbox claim",workerSource.includes("status='processing',processing_at=CURRENT_TIMESTAMP")&&workerSource.includes("stale_delivery_claim_recovered")],
  ["monthly cost allowance",workerSource.includes('reserveWhatsAppAllowance')&&workerSource.includes('whatsapp_monthly_allowance_exhausted')&&migration.includes("('business','whatsapp_notifications',1,80)")],
  ["preference consent gate",workerSource.includes('whatsapp_consent_required')&&workerSource.includes('whatsapp_connector_not_configured')],
  ["outbox delivery state",schema.includes('provider_status')&&schema.includes('provider_status_at')],
  ["consent storage",schema.includes('CREATE TABLE IF NOT EXISTS whatsapp_consents')&&schema.includes("status IN ('active','revoked')")],
  ["delivery event storage",schema.includes('CREATE TABLE IF NOT EXISTS whatsapp_delivery_events')&&schema.includes('provider_message_id')],
  ["migration parity",migration.includes('whatsapp_consents')&&migration.includes('whatsapp_delivery_events')&&migration.includes('provider_status')],
  ["consent UI",html.includes('id="whatsappConsentPanel"')&&html.includes('I consent to utility reminders')&&html.includes('revokeWhatsAppConsent()')],
  ["truthful delivery UI",html.includes('Accepted by WhatsApp is not the same as delivered')&&html.includes('provider_status')],
  ["configuration documented",envExample.includes('WHATSAPP_ACCESS_TOKEN')&&envExample.includes('WHATSAPP_APP_SECRET')&&envExample.includes('WHATSAPP_TEMPLATE_MAP_JSON')]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?"PASS":"FAIL"} ${name}`);
if(failed.length)process.exit(1);

console.log("v76 WhatsApp notification contract checks passed");
