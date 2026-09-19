import assert from "node:assert/strict";
import fs from "node:fs";
import {AGENT_ACTION_CATALOG} from "../cloudflare/src/agent-policy.js";
import {__whatsappAgenticTest} from "../cloudflare/src/agentic-whatsapp-core.js";

const source=fs.readFileSync(new URL("../cloudflare/src/agentic-whatsapp-core.js",import.meta.url),"utf8");
const entry=fs.readFileSync(new URL("../cloudflare/src/agentic-entry.js",import.meta.url),"utf8");
const migration=fs.readFileSync(new URL("../cloudflare/migrations/047_v81_delegated_authority.sql",import.meta.url),"utf8");
let checks=0;const ok=(value,message)=>{assert.ok(value,message);checks++};

const purposes=__whatsappAgenticTest.ACTION_KEY_BY_PURPOSE;
assert.deepEqual(Object.keys(purposes).sort(),["compliance_followup","finance_exception","operations_update","owner_daily_brief"].sort());checks++;
for(const [purpose,spec] of Object.entries(purposes)){
  const action=AGENT_ACTION_CATALOG[spec.actionKey];
  ok(!!action,`${purpose} maps to registered action`);
  assert.equal(spec.agentKey,"thebe",`${purpose} must route through the canonical Thebe agent`);checks++;
  assert.equal(action.level,2);checks++;
  assert.equal(action.humanReviewRequired,true);checks++;
  assert.equal(action.externalSideEffect,false);checks++;
}

const ownerDraft=__whatsappAgenticTest.buildDraft("owner_daily_brief",{cashPositionMinor:123450,financeAccountCount:2,reconciliationExceptions:1,reconciliationExposureMinor:5000,overdueCompliance:2,complianceDue14d:3,pendingWorkflows:4,failedWorkflows:1,criticalPerformanceSignals:1},{date:"2026-09-14"});
ok(ownerDraft.includes("Recorded cash: P1234.5"),"owner brief carries recorded finance facts");
ok(ownerDraft.includes("Review in Thebe Desk before sending or acting."),"owner brief requires human review");
const financeDraft=__whatsappAgenticTest.buildDraft("finance_exception",{exception:{accountName:"Main account",differenceMinor:1250,statementTo:"2026-09-13"}},{date:"2026-09-14"});
ok(financeDraft.includes("reconciliation difference P12.5"),"finance draft carries recorded reconciliation difference");
ok(financeDraft.includes("before correcting anything"),"finance draft prevents auto-correction framing");
const complianceDraft=__whatsappAgenticTest.buildDraft("compliance_followup",{overdueCount:1,due14dCount:2,nextDueAt:"2026-09-20T00:00:00Z"},{date:"2026-09-14"});
ok(complianceDraft.includes("before filing or submitting anything"),"compliance draft preserves filing human boundary");
const opsDraft=__whatsappAgenticTest.buildDraft("operations_update",{latestSummaryDate:"2026-09-13",reportingCoverage:80,pendingWorkflows:2,failedWorkflows:0},{date:"2026-09-14"});
ok(opsDraft.includes("before making any employee or disciplinary decision"),"operations draft preserves employment human boundary");

ok(source.includes('/api/agentic/whatsapp/status'),"capability status route exists");
ok(source.includes('/api/agentic/whatsapp/prepare'),"prepare route exists");
ok(source.includes('csrfAllowed(request,auth)'),"prepare mutation requires CSRF");
ok(source.includes('originAllowed(request,env)'),"prepare mutation requires same-origin policy");
ok(source.includes('idempotency_key_required'),"prepare mutation requires idempotency");
ok(source.includes('idempotency_key_conflict'),"idempotency key reuse fails closed across different requests");
ok(source.includes("status:'review_required'")||source.includes('status:"review_required"')||source.includes("'review_required')"),"prepared intent is review-required");
ok(source.includes('recipientTargeting:false'),"API truthfully reports recipient targeting disabled");
ok(source.includes('providerSend:false'),"API truthfully reports provider send disabled");
ok(source.includes('ALLOWED_BODY_KEYS=new Set(["purpose"])'),"request body permits purpose only");
ok(source.includes('unsupported_field'),"unexpected delivery or message fields are rejected");

ok(!source.includes('WHATSAPP_ACCESS_TOKEN'),"prepare layer cannot read Meta access tokens");
ok(!source.includes('WHATSAPP_PHONE_NUMBER_ID'),"prepare layer cannot read Meta phone-number IDs");
ok(!source.includes('phone_e164'),"prepare layer cannot address a WhatsApp recipient");
ok(!source.includes('notification_outbox'),"prepare layer cannot queue notification delivery");
ok(!source.includes('enqueueWhatsAppNotification'),"prepare layer cannot call WhatsApp queue helper");
ok(!source.includes('graph.facebook.com'),"prepare layer has no Meta Graph host");
ok(!source.includes('/messages'),"prepare layer exposes no provider message endpoint");
ok(!/\bfetch\s*\(/.test(source),"prepare layer performs no outbound fetch");

const whatsappIndex=entry.indexOf('handleAgenticWhatsAppRequest');
const authorityIndex=entry.indexOf('handleAgenticAuthorityRequest({request,logicalPath,env})');
ok(whatsappIndex>=0&&authorityIndex>whatsappIndex,"V81 wrapper routes prepare-only WhatsApp before delegated-authority fallback");
ok(entry.includes('const runtimeResponse=await applyClientRuntimeIdentity(request,response)'),"V81 wrapper preserves runtime identity decoration after production dispatch");
ok(entry.includes('return enhanceReadiness(request,env,runtimeResponse)'),"V81 readiness wrapper remains intact after runtime identity decoration");
ok(migration.includes("CHECK(mode='shadow')"),"V81 action-intent schema remains hard-locked to shadow mode");
ok(migration.includes("CHECK(shadow_only=1)"),"delegations remain hard-locked shadow-only");
ok(!migration.includes('agentic_execution'),"no execution queue exists in delegated-authority schema");

console.log(`V82 WhatsApp prepare-only gate: ${checks}/${checks} PASS`);