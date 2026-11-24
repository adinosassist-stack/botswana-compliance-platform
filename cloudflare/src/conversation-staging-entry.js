// Dedicated conversation staging Worker. The bootstrap profile stays inert.
import {createConversationStagingAuthenticatedEntry} from "./conversation-staging-authenticated-entry-rehearsal.js";
import {mayEnableConversationRehearsal} from "./conversation-staging-gate.js";

const conversations=createConversationStagingAuthenticatedEntry();
const locked=()=>Response.json({error:"staging_not_activated"},{status:503,headers:{"cache-control":"no-store","x-robots-tag":"noindex, nofollow"}});

export default {
 async fetch(request,env){
  if(env?.APP_ENV!=="staging"||env.DEPLOYMENT_ENV!=="staging"||
     env.DEPLOYMENT_PROFILE!=="conversation-staging"||env.CONVERSATION_HISTORY_STAGING_ENABLED!=="true")return locked();
  if(!mayEnableConversationRehearsal({
   env,deployment:{environment:env.DEPLOYMENT_ENV},
   privacyApproved:env.CONVERSATION_STAGING_PRIVACY_APPROVED==="true",
   migrationQualified:env.CONVERSATION_STAGING_MIGRATION_QUALIFIED==="true"
  }))return locked();
  return conversations.fetch(request,env);
 }
};
