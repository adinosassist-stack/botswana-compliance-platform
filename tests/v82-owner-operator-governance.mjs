import assert from "node:assert/strict";
import { buildOwnerOperatorQueue, ownerOperatorCapabilities, routeOwnerOperatorWork } from "../cloudflare/src/owner-operator.js";

const denied=routeOwnerOperatorWork({domain:"finance",intent:"read",actorRole:"owner",tenantScoped:false});
assert.equal(denied.allowed,false);
assert.equal(denied.code,"tenant_scope_required");

const finance=routeOwnerOperatorWork({domain:"finance",intent:"read",actorRole:"owner",tenantScoped:true});
assert.equal(finance.allowed,true);
assert.equal(finance.specialist.key,"finance");
assert.equal(finance.actionKey,"financial_position.read");
assert.equal(finance.decision,"allow_read");

const complianceDraft=routeOwnerOperatorWork({domain:"compliance",intent:"prepare",actorRole:"owner",tenantScoped:true});
assert.equal(complianceDraft.allowed,true);
assert.equal(complianceDraft.decision,"prepare_only");
assert.equal(complianceDraft.humanReviewRequired,true);
assert.equal(complianceDraft.externalSideEffect,false);

const reviewerManagement=routeOwnerOperatorWork({domain:"management",intent:"read",actorRole:"reviewer",tenantScoped:true});
assert.equal(reviewerManagement.allowed,false);
assert.equal(reviewerManagement.code,"role_forbidden");

const unknown=routeOwnerOperatorWork({domain:"property",intent:"read",actorRole:"owner",tenantScoped:true});
assert.equal(unknown.allowed,false);
assert.equal(unknown.code,"unknown_domain");

const queue=buildOwnerOperatorQueue([
  {id:"low",domain:"management",severity:"low",title:"Routine review"},
  {id:"critical",domain:"compliance",severity:"critical",overdue:true,prepare:true,title:"Overdue filing evidence"},
  {id:"high",domain:"finance",severity:"high",title:"Reconciliation exception"},
  {id:"ignored",domain:"unknown",severity:"critical",title:"Unregistered domain"}
],{actorRole:"owner",tenantScoped:true});
assert.equal(queue.length,3);
assert.equal(queue[0].id,"critical");
assert.equal(queue[0].status,"ready_for_review");
assert.equal(queue[0].humanReviewRequired,true);
assert.equal(queue[0].externalSideEffect,false);
assert.equal(queue[1].id,"high");

const caps=ownerOperatorCapabilities();
assert.equal(caps.mode,"governed_persistent_operator");
assert.ok(caps.autonomous.includes("prioritise"));
assert.ok(caps.approvalGated.includes("payments"));
assert.match(caps.invariant,/cannot grant itself permissions/i);

console.log("Owner Operator governance tests passed");
