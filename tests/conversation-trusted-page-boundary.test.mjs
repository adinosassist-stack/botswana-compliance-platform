import assert from "node:assert/strict";
import {readPageFromTrustedSession} from "../cloudflare/src/conversation-session-boundary-rehearsal.js";
const secret="0123456789abcdef0123456789abcdef";
const context={session:{authenticated:true,active:true,userId:"u1",tenantId:"a"},workspaceMembership:{userId:"u1",tenantId:"a",conversationId:"thread",role:"member",active:true},conversation:{id:"thread",tenantId:"a",status:"active"}};
let calls=0;
const env={DB:{prepare(){return{bind(...args){assert.deepEqual(args,["a","thread",26]);return{async all(){calls++;return{success:true,results:[]}}}}}}}};
const ok=await readPageFromTrustedSession({env,context,secret});assert.equal(ok.ok,true);assert.equal(calls,1);
for(const mutation of [{session:{...context.session,active:false}},{session:{...context.session,tenantId:"b"}},{workspaceMembership:{...context.workspaceMembership,active:false}},{workspaceMembership:{...context.workspaceMembership,conversationId:"other"}}]){
 const result=await readPageFromTrustedSession({env,context:{...context,...mutation},secret});assert.equal(result.ok,false);
}
assert.equal(calls,1);
assert.equal((await readPageFromTrustedSession({env,context,secret,cursor:"forged"})).error,"invalid_cursor");
assert.equal(calls,1);
console.log("Trusted session paginated boundary PASS");
