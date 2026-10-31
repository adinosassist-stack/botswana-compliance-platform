// Generate an isolated, non-routed staging configuration. Does not deploy or migrate.
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
const root=fileURLToPath(new URL("../",import.meta.url));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROD="8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce";
const BILLING="9d1b8852-4424-46e9-ba24-cdad5ced215f";
const STAGING="95c48030-0395-44cb-aa95-622beaf4efdf";
export function conversationStagingConfig(env={}){
 const id=String(env.CONVERSATION_STAGING_D1_ID||"").trim().toLowerCase();
 const production=String(env.PRODUCTION_D1_DATABASE_ID||PROD).trim().toLowerCase();
 const billing=String(env.BILLING_STAGING_D1_ID||BILLING).trim().toLowerCase();
 if(!UUID.test(id)||id!==STAGING||id===PROD||id===BILLING||id===production||id===billing)
   throw Error("conversation_staging_d1_must_be_distinct");
 if(!UUID.test(production)||!UUID.test(billing)||production===billing)
   throw Error("known_database_id_invalid");
 const sha=String(env.CONVERSATION_STAGING_SOURCE_SHA||"");
 if(!/^[0-9a-f]{40}$/.test(sha))throw Error("exact_source_sha_required");
 return {
  name:"bw-conversation-staging",
  main:path.join(root,"cloudflare/src/conversation-staging-entry.js"),
  compatibility_date:"2026-09-03",
  workers_dev:false,preview_urls:false,keep_vars:false,
  routes:[],
  vars:{
   APP_ENV:"staging",DEPLOYMENT_PROFILE:"conversation-staging-locked",
   CONVERSATION_STAGING_SOURCE_SHA:sha,
   CONVERSATION_REHEARSAL_ENABLED:"false",
   CONVERSATION_REHEARSAL_WRITE_ENABLED:"false",
   AI_FEATURES_DEFAULT:"off",
   PAYMENT_PROVIDER:"none",
   THEBE_LIVE_VOICE_ENABLED:"false"
  },
  d1_databases:[{binding:"DB",database_name:"bw-conversation-staging",database_id:id}]
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{process.stdout.write(JSON.stringify(conversationStagingConfig(process.env),null,2)+"\n")}
 catch(error){console.error(error.message);process.exitCode=1}
}
