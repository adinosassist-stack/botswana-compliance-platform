import assert from "node:assert/strict";
import {createConversationStagingContextResolver as create} from "../cloudflare/src/conversation-staging-context-resolver-rehearsal.js";
const env={DEPLOYMENT_ENV:"staging"},request={method:"GET"},threadId="thread";
const session={authenticated:true,active:true,userId:"u",tenantId:"T",csrfVerified:false};
let memberships=0,conversations=0;
const factory=(s=session,m={active:true,userId:"u",tenantId:"T",conversationId:"thread"},c={id:"thread",tenantId:"T",status:"active"})=>create({
 readSession:async()=>s,
 readMembership:async args=>{memberships++;assert.deepEqual({userId:args.userId,tenantId:args.tenantId,threadId:args.threadId},{userId:"u",tenantId:"T",threadId:"thread"});return m},
 readConversation:async args=>{conversations++;assert.deepEqual({tenantId:args.tenantId,threadId:args.threadId},{tenantId:"T",threadId:"thread"});return c}
});
assert.throws(()=>create({}),/trusted_server_resolvers_required/);
await assert.rejects(factory({...session,active:false})({env,request,threadId}));
assert.equal(memberships,0);
await assert.rejects(factory(session,{active:true,userId:"u",tenantId:"OTHER",conversationId:"thread"})({env,request,threadId}));
assert.equal(conversations,0);
await assert.rejects(factory(session,undefined,{id:"thread",tenantId:"OTHER",status:"active"})({env,request,threadId}));
const context=await factory()({env,request,threadId});
assert.equal(context.session.tenantId,"T");assert.equal(context.csrfVerified,false);
console.log("Staging trusted context resolver isolation PASS");
