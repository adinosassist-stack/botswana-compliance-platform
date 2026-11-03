import assert from "node:assert/strict";
import {appendFromTrustedSession,readFromTrustedSession} from "../cloudflare/src/conversation-session-boundary-rehearsal.js";
const context={session:{authenticated:true,active:true,userId:"user1",tenantId:"A"},workspaceMembership:{active:true,userId:"user1",tenantId:"A",conversationId:"t1",role:"member"},conversation:{id:"t1",tenantId:"A",status:"active"}};
const body={role:"user",sourceKind:"typed",content:"Find invoices",idempotencyKey:"k1",tenantId:"B",ownerId:"attacker"};
let inserts=0,tenantArgs=[];
const env={DB:{prepare(){return {bind(...args){tenantArgs.push(args);return {async run(){inserts++;return {success:true,meta:{changes:1}}},async all(){return {results:[]}},async first(){return null}}}}}}};
const saved=await appendFromTrustedSession({env,context,clientBody:body,id:()=>"msg1"});
assert.equal(saved.ok,true);
assert.equal(inserts,1);
assert(tenantArgs.every(args=>args[0]==="A"&&args[1]==="t1"));
assert.equal((await readFromTrustedSession({env,context})).ok,true);
const prior=inserts;
for(const mutation of [
 {session:{...context.session,authenticated:false}},
 {session:{...context.session,tenantId:"B"}},
 {workspaceMembership:{...context.workspaceMembership,userId:"other"}},
 {workspaceMembership:{...context.workspaceMembership,active:false}},
 {conversation:{...context.conversation,tenantId:"B"}}
]){
 const result=await appendFromTrustedSession({env,context:{...context,...mutation},clientBody:body});
 assert.equal(result.error,"access_denied");
}
assert.equal(inserts,prior);
console.log("Trusted conversation session boundary PASS");
