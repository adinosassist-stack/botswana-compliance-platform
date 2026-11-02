import {readGeneralAiJsonBody} from "./general-ai-request-body.js";
import {answerGeneralQuestion} from "./general-ai-research-orchestrator.js";
import {planGeneralAiRequest} from "./general-ai-research-policy.js";
import {createGeneralAiModelProvider} from "./general-ai-model-provider.js";
import {createGeneralAiSearchProvider} from "./general-ai-search-provider.js";

export const generalAiResultStatus=result=>result?.ok?200:result?.error==="authorization_required"||result?.error==="action_request_not_supported"?403:result?.error==="research_sources_unavailable"||result?.error==="model_unavailable"?503:400;
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
/**
 * Disabled by default. Authentication and CSRF validation are supplied by the
 * existing application boundary; this handler additionally checks their proofs.
 * Never trusts tenant identifiers from request JSON.
 */
export async function handleGeneralAiRoute({request,path,env,auth}={}){
  if(path!=="/api/ai/general")return null;
  if(request.method!=="POST")return reply({error:"method_not_allowed"},405);
  if(env?.THEBE_GENERAL_AI_ENABLED!=="true")return reply({error:"feature_disabled"},404);
  if(!auth?.user_id||!auth?.tenant_id)return reply({error:"unauthenticated"},401);
  const origin=request.headers.get("origin");
  const expected=String(env?.PUBLIC_ORIGIN||env?.PUBLIC_APP_URL||"");
  let allowedOrigin="";
  try{allowedOrigin=new URL(expected).origin}catch{}
  if(!origin||!allowedOrigin||origin!==allowedOrigin)return reply({error:"origin_failed"},403);
  if(!auth.csrf_token||request.headers.get("x-csrf-token")!==auth.csrf_token)return reply({error:"csrf_failed"},403);
  const parsed=await readGeneralAiJsonBody(request);
  if(!parsed.ok)return reply({error:parsed.error},parsed.status);
  const body=parsed.value;
  if(typeof body?.question!=="string")return reply({error:"invalid_question"},400);
  const planned=planGeneralAiRequest(body.question);
  if(!planned.ok)return reply({error:planned.error},400);
  // This endpoint is for general knowledge; private workspace requests stay on
  // their separately authorized, tenant-scoped business endpoints.
  if(planned.businessAuthorizationRequired)return reply({error:"use_authorized_workspace_ai"},403);
  if(planned.approvalRequired)return reply({error:"action_request_not_supported"},403);
  // A current-information question must not spend provider quota when live search is unavailable.
  const researchEnabled=env.THEBE_GENERAL_AI_RESEARCH_ENABLED==="true"&&!!env.BRAVE_SEARCH_API_KEY;
  if(planned.researchRequested&&!researchEnabled)return reply({error:"research_sources_unavailable",notice:"Live research is not configured."},503);
  // An independently configured Cloudflare rate-limit binding is mandatory
  // before the feature can be enabled; absent binding fails closed.
  if(typeof env?.GENERAL_AI_RATE_LIMITER?.limit!=="function")return reply({error:"rate_limit_unavailable"},503);
  try{
    const limit=await env.GENERAL_AI_RATE_LIMITER.limit({key:String(auth.tenant_id)+":"+String(auth.user_id)});
    if(limit?.success!==true)return reply({error:"rate_limit_exceeded"},429);
  }catch{return reply({error:"rate_limit_unavailable"},503)}
  let model;
  try{model=createGeneralAiModelProvider({apiKey:env.OPENAI_API_KEY,model:env.THEBE_GENERAL_AI_MODEL})}
  catch{return reply({error:"model_unavailable"},503)}
  const search=researchEnabled?createGeneralAiSearchProvider({apiKey:env.BRAVE_SEARCH_API_KEY}):undefined;
  try{
    const result=await answerGeneralQuestion({question:body.question,model,search,researchEnabled,authorized:false});
    return reply(result,generalAiResultStatus(result));
  }catch{return reply({error:"ai_provider_unavailable"},503)}
}
