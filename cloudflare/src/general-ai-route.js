import {answerGeneralQuestion} from "./general-ai-research-orchestrator.js";
import {createGeneralAiModelProvider} from "./general-ai-model-provider.js";
import {createGeneralAiSearchProvider} from "./general-ai-search-provider.js";

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
  if(!origin||!expected||origin!==new URL(expected).origin)return reply({error:"origin_failed"},403);
  if(!auth.csrf_token||request.headers.get("x-csrf-token")!==auth.csrf_token)return reply({error:"csrf_failed"},403);
  if(Number(request.headers.get("content-length")||0)>8500)return reply({error:"request_too_large"},413);
  let body;
  try{
    const raw=await request.text();
    if(new TextEncoder().encode(raw).byteLength>8500)return reply({error:"request_too_large"},413);
    body=JSON.parse(raw);
  }catch{return reply({error:"invalid_json"},400)}
  if(typeof body?.question!=="string")return reply({error:"invalid_question"},400);
  let model;
  try{model=createGeneralAiModelProvider({apiKey:env.OPENAI_API_KEY,model:env.THEBE_GENERAL_AI_MODEL})}
  catch{return reply({error:"model_unavailable"},503)}
  const researchEnabled=env.THEBE_GENERAL_AI_RESEARCH_ENABLED==="true"&&!!env.BRAVE_SEARCH_API_KEY;
  const search=researchEnabled?createGeneralAiSearchProvider({apiKey:env.BRAVE_SEARCH_API_KEY}):undefined;
  try{
    const result=await answerGeneralQuestion({question:body.question,model,search,researchEnabled,authorized:false});
    return reply(result,result.ok?200:result.error==="authorization_required"?403:400);
  }catch{return reply({error:"ai_provider_unavailable"},503)}
}
