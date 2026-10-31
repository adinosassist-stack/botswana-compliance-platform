import assert from "node:assert/strict";
import {mayEnableConversationRehearsal} from "../cloudflare/src/conversation-staging-gate.js";
const env={CONVERSATION_REHEARSAL_ENABLED:"true",CONVERSATION_REHEARSAL_WRITE_ENABLED:"true",CONVERSATION_CURSOR_SECRET:"s".repeat(32),DB:{prepare(){}}};
const deployment={environment:"staging",production:false};
const args={env,deployment,privacyApproved:true,migrationQualified:true};
assert.equal(mayEnableConversationRehearsal(args),true);
for(const change of [
 {deployment:{environment:"production",production:true}},
 {deployment:{environment:"staging",production:true}},
 {deployment:{environment:"preview",production:false}},
 {env:{...env,CONVERSATION_REHEARSAL_ENABLED:"false"}},
 {env:{...env,CONVERSATION_REHEARSAL_WRITE_ENABLED:"false"}},
 {env:{...env,CONVERSATION_CURSOR_SECRET:"short"}},
 {env:{...env,DB:null}},
 {privacyApproved:false},
 {migrationQualified:false}
])assert.equal(mayEnableConversationRehearsal({...args,...change}),false);
assert.equal(mayEnableConversationRehearsal(),false);
console.log("Staging conversation feature gate fails closed PASS");
