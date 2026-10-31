import assert from "node:assert/strict";
import {handleGatedConversationRehearsal} from "../cloudflare/src/conversation-gated-handler-rehearsal.js";
const url="https://staging.invalid/api/staging/conversation-rehearsal/messages";
const request=new Request(url);
const env={CONVERSATION_REHEARSAL_ENABLED:"true",CONVERSATION_REHEARSAL_WRITE_ENABLED:"true",CONVERSATION_CURSOR_SECRET:"x".repeat(32),DB:{prepare(){throw Error("should never touch DB while gate disabled")}}};
const base={request,env,deployment:{environment:"staging",production:false},privacyApproved:true,migrationQualified:true};
for(const change of [{privacyApproved:false},{migrationQualified:false},{deployment:{environment:"production",production:true}},{env:{...env,CONVERSATION_REHEARSAL_ENABLED:"false"}}]){
 const response=await handleGatedConversationRehearsal({...base,...change});assert.equal(response.status,404);
}
const response=await handleGatedConversationRehearsal({...base,context:{session:{authenticated:false}}});
assert.equal(response.status,503,"missing staging schema must fail closed before session handling");
const qualifiedEnv={...env,DB:{prepare(){return {bind(){return {async all(){return {results:[{name:"thebe_conversations_rehearsal"},{name:"thebe_conversation_members_rehearsal"},{name:"thebe_conversation_messages_rehearsal"}]}}}}}}}};
const denied=await handleGatedConversationRehearsal({...base,env:qualifiedEnv,context:{session:{authenticated:false}}});
assert.equal(denied.status,403,"qualified schema still denies unauthenticated access");
console.log("Conversation staging-only handler composition gate PASS");
