import assert from "node:assert/strict";
import {conversationStagingConfig} from "../scripts/render-conversation-staging-config.mjs";
import staging from "../cloudflare/src/conversation-staging-entry.js";
const valid={CONVERSATION_STAGING_D1_ID:"95c48030-0395-44cb-aa95-622beaf4efdf",CONVERSATION_STAGING_SOURCE_SHA:"a".repeat(40)};
const c=conversationStagingConfig(valid);
assert.deepEqual(c.routes,[]);
assert.equal(c.workers_dev,false);
assert.equal(c.vars.CONVERSATION_REHEARSAL_ENABLED,"false");
assert.equal(c.vars.CONVERSATION_REHEARSAL_WRITE_ENABLED,"false");
assert.equal(c.d1_databases[0].database_id,valid.CONVERSATION_STAGING_D1_ID);
for(const blocked of ["8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce","9d1b8852-4424-46e9-ba24-cdad5ced215f","invalid","ab098765-4321-4f00-8901-123456789abc"])
 assert.throws(()=>conversationStagingConfig({...valid,CONVERSATION_STAGING_D1_ID:blocked}));
assert.throws(()=>conversationStagingConfig({...valid,CONVERSATION_STAGING_SOURCE_SHA:""}));
const response=await staging.fetch(new Request("https://unrouted.invalid/api/staging/conversation-rehearsal/messages"));
assert.equal(response.status,503);
console.log("Isolated conversation staging config and locked entry PASS");

const profile={
 APP_ENV:"staging",DEPLOYMENT_ENV:"staging",DEPLOYMENT_PROFILE:"conversation-staging",
 CONVERSATION_HISTORY_STAGING_ENABLED:"true",CONVERSATION_REHEARSAL_ENABLED:"true",
 CONVERSATION_REHEARSAL_WRITE_ENABLED:"true",CONVERSATION_STAGING_PRIVACY_APPROVED:"true",
 CONVERSATION_STAGING_MIGRATION_QUALIFIED:"true",CONVERSATION_CURSOR_SECRET:"x".repeat(32),
 CONVERSATION_STAGING_ORIGIN:"https://conversation-staging.invalid",CONVERSATION_STAGING_D1_ID:valid.CONVERSATION_STAGING_D1_ID,
 DB:{prepare(){throw new Error("Database must stay untouched")}}
};
const directory=new Request(profile.CONVERSATION_STAGING_ORIGIN+"/api/conversation-staging/threads");
for(const key of ["APP_ENV","DEPLOYMENT_ENV","DEPLOYMENT_PROFILE","CONVERSATION_HISTORY_STAGING_ENABLED","CONVERSATION_REHEARSAL_ENABLED","CONVERSATION_REHEARSAL_WRITE_ENABLED","CONVERSATION_STAGING_PRIVACY_APPROVED","CONVERSATION_STAGING_MIGRATION_QUALIFIED","CONVERSATION_CURSOR_SECRET"]){
 const locked=await staging.fetch(directory,{...profile,[key]:""});
 assert.equal(locked.status,503,key);
 assert.deepEqual(await locked.json(),{error:"staging_not_activated"},key);
}
const mismatched=await staging.fetch(new Request("https://other.invalid/api/conversation-staging/threads"),profile);
assert.equal(mismatched.status,403);
const unmarked=await staging.fetch(directory,profile);
assert.deepEqual(await unmarked.json(),{ok:false,error:"staging_database_identity_required"});

const privateInput={
 ...valid,CONVERSATION_STAGING_MODE:"private-service",
 CONVERSATION_STAGING_ORIGIN:"https://conversation-staging.thebedesk.com",
 CONVERSATION_STAGING_PRIVACY_APPROVED:"true",
 CONVERSATION_STAGING_MIGRATION_QUALIFIED:"true",
 CONVERSATION_CURSOR_SECRET:"runtime-only"
};
const privateConfig=conversationStagingConfig(privateInput);
assert.deepEqual(privateConfig.routes,[]);
assert.equal(privateConfig.workers_dev,false);
assert.equal(privateConfig.preview_urls,false);
assert.equal(privateConfig.vars.DEPLOYMENT_PROFILE,"conversation-staging");
assert.equal(privateConfig.vars.CONVERSATION_STAGING_D1_ID,valid.CONVERSATION_STAGING_D1_ID);
assert.equal(privateConfig.vars.CONVERSATION_HISTORY_STAGING_ENABLED,"true");
assert.equal(privateConfig.vars.CONVERSATION_STAGING_ORIGIN,privateInput.CONVERSATION_STAGING_ORIGIN);
assert.equal(Object.hasOwn(privateConfig.vars,"CONVERSATION_CURSOR_SECRET"),false);
for(const approval of ["CONVERSATION_STAGING_PRIVACY_APPROVED","CONVERSATION_STAGING_MIGRATION_QUALIFIED"])
 assert.throws(()=>conversationStagingConfig({...privateInput,[approval]:"false"}),/approval_required/);
for(const invalidOrigin of ["https://thebedesk.com","https://conversation-staging.thebedesk.com/","https://conversation-staging.thebedesk.com.evil.invalid","http://conversation-staging.thebedesk.com"])
 assert.throws(()=>conversationStagingConfig({...privateInput,CONVERSATION_STAGING_ORIGIN:invalidOrigin}),/staging_origin_required/);
