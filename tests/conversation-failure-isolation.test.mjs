import assert from "node:assert/strict";
import {appendConversationMessageRehearsal,listConversationMessagesRehearsal} from "../cloudflare/src/conversation-storage-rehearsal.js";
const actor={authenticated:true,active:true,userId:"user1",tenantId:"tenant1"};
const conversation={id:"thread1",tenantId:"tenant1",status:"active"};
const membership={active:true,userId:"user1",tenantId:"tenant1",conversationId:"thread1",role:"member"};
const message={role:"user",sourceKind:"voice_final",content:"Finalized instruction",idempotencyKey:"voice_101"};
const base={actor,conversation,membership,message};
const failureDB={prepare(sql){return {bind(){return {async run(){throw new Error("private provider error: token")} ,async first(){throw new Error("private provider error")},async all(){throw new Error("private provider error")}}}}}};
const denied=await appendConversationMessageRehearsal({...base,env:{DB:failureDB}});
assert.deepEqual(denied,{ok:false,error:"storage_unavailable"});
const failedList=await listConversationMessagesRehearsal({...base,env:{DB:failureDB}});
assert.deepEqual(failedList,{ok:false,error:"storage_unavailable"});
let inserts=0;
const env={DB:{prepare(sql){return {bind(...params){return {
 async run(){inserts++;return {success:true,meta:{changes:1}}},
 async first(){return null},
 async all(){return {results:[]}}
}}}}}};
const revoked={...membership,active:false};
assert.equal((await appendConversationMessageRehearsal({...base,membership:revoked,env})).error,"access_denied");
assert.equal((await listConversationMessagesRehearsal({...base,membership:revoked,env})).error,"access_denied");
assert.equal(inserts,0);
assert.equal((await appendConversationMessageRehearsal({...base,env,message:{...message,sourceKind:"voice_partial"}})).error,"invalid_message");
assert.equal(inserts,0);
console.log("Conversation retry and storage failure isolation PASS");
