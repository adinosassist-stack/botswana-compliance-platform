import assert from "node:assert/strict";
import {conversationStagingBoundary as handle} from "../cloudflare/src/conversation-staging-boundary-rehearsal.js";
const context={session:{authenticated:true,active:true,userId:"user1",tenantId:"A"},workspaceMembership:{active:true,userId:"user1",tenantId:"A",conversationId:"chat",role:"member"},conversation:{id:"chat",tenantId:"A",status:"active"},csrfVerified:true};
const headers=new Map([["content-type","application/json"],["content-length","100"]]);
const request=(method,body={role:"user",sourceKind:"typed",content:"Hello",idempotencyKey:"k1"})=>({method,headers:{get:key=>headers.get(key)||null},json:async()=>body});
let queries=0;
const env={DB:{prepare(){queries++;return{bind(){return{async run(){return{success:true,meta:{changes:1}}},async first(){return null},async all(){return{results:[]}}}}}}}};
for(const mutation of [
 {session:{...context.session,authenticated:false}},
 {session:{...context.session,active:false}},
 {session:{...context.session,tenantId:"B"}},
 {workspaceMembership:{...context.workspaceMembership,active:false}},
 {workspaceMembership:{...context.workspaceMembership,userId:"foreign"}},
 {conversation:{...context.conversation,tenantId:"B"}}
]){
 const result=await handle({env,request:request("GET"),context:{...context,...mutation},threadId:"chat"});
 assert.notEqual(result.status,200);
}
assert.equal(queries,0,"unauthorized requests must not query D1");
assert.equal((await handle({env,request:request("POST"),context:{...context,csrfVerified:false},threadId:"chat"})).status,403);
assert.equal(queries,0,"CSRF rejection must precede D1");
const ok=await handle({env,request:request("GET"),context,threadId:"chat"});
assert.equal(ok.status,200);
assert.equal(ok.body.ok,true);
console.log("Conversation staging tenant, session, CSRF and D1 preflight tests PASS");
