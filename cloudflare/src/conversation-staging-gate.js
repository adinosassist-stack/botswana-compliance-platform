// Pure staging enablement gate; intentionally NOT mounted in the production router.
// The caller must supply deployment identity from trusted Worker configuration,
// never from request headers, query strings, cookies or user-controlled JSON.
export function mayEnableConversationRehearsal({env,deployment,privacyApproved=false,migrationQualified=false}={}){
  if(!env||!deployment)return false;
  if(deployment.environment!=="staging"||deployment.production===true)return false;
  if(env.CONVERSATION_REHEARSAL_ENABLED!=="true")return false;
  if(env.CONVERSATION_REHEARSAL_WRITE_ENABLED!=="true")return false;
  if(privacyApproved!==true||migrationQualified!==true)return false;
  if(typeof env.CONVERSATION_CURSOR_SECRET!=="string"||env.CONVERSATION_CURSOR_SECRET.length<32)return false;
  if(!env.DB?.prepare)return false;
  return true;
}
