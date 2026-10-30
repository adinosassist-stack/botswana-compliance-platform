import assert from "node:assert/strict";
import {conversationStagingConfig} from "../scripts/render-conversation-staging-config.mjs";
import staging from "../cloudflare/src/conversation-staging-entry.js";
const valid={CONVERSATION_STAGING_D1_ID:"ab098765-4321-4f00-8901-123456789abc",CONVERSATION_STAGING_SOURCE_SHA:"a".repeat(40)};
const c=conversationStagingConfig(valid);
assert.deepEqual(c.routes,[]);
assert.equal(c.workers_dev,false);
assert.equal(c.vars.CONVERSATION_REHEARSAL_ENABLED,"false");
assert.equal(c.vars.CONVERSATION_REHEARSAL_WRITE_ENABLED,"false");
assert.equal(c.d1_databases[0].database_id,valid.CONVERSATION_STAGING_D1_ID);
for(const blocked of ["8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce","9d1b8852-4424-46e9-ba24-cdad5ced215f","invalid"])
 assert.throws(()=>conversationStagingConfig({...valid,CONVERSATION_STAGING_D1_ID:blocked}));
assert.throws(()=>conversationStagingConfig({...valid,CONVERSATION_STAGING_SOURCE_SHA:""}));
const response=await staging.fetch(new Request("https://unrouted.invalid/api/staging/conversation-rehearsal/messages"));
assert.equal(response.status,503);
console.log("Isolated conversation staging config and locked entry PASS");
