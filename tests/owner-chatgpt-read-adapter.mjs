import test from "node:test";
import assert from "node:assert/strict";
import {runOwnerChatgptRead} from "../cloudflare/src/owner-chatgpt-read-adapter.js";
const identity={serverVerified:true,role:"owner",tenantId:"tenant-a"};
test("disabled by default without touching database",async()=>{
 const r=await runOwnerChatgptRead({env:{},verifiedIdentity:identity,tenantId:"tenant-a",actionKey:"financial_position.read"});
 assert.equal(r.error,"owner_assistant_disabled");assert.equal(r.executionAllowed,false);
});
test("rejects manager before accessing data",async()=>{
 const r=await runOwnerChatgptRead({env:{OWNER_CHATGPT_PRIVATE_READ_ENABLED:"1"},verifiedIdentity:{...identity,role:"manager"},tenantId:"tenant-a",actionKey:"financial_position.read"});
 assert.equal(r.error,"owner_identity_required");
});
test("rejects writes before accessing data",async()=>{
 const r=await runOwnerChatgptRead({env:{OWNER_CHATGPT_PRIVATE_READ_ENABLED:"1"},verifiedIdentity:identity,tenantId:"tenant-a",actionKey:"payment.approve"});
 assert.equal(r.error,"read_action_not_allowed");
});
