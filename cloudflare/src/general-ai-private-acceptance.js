import {readBoundedProviderJson} from "./general-ai-bounded-json.js";
import {validateResearchSources} from "./general-ai-research-policy.js";

/** Offline-first service-binding acceptance contract for private General AI staging.
 * This module is deliberately NOT a Worker entrypoint and has no trigger, route,
 * service binding deployment or credential access. It may be invoked later only
 * by an independently approved and authenticated private test runner.
 */
const EXPECTED_ORIGIN = "https://ai-staging.thebedesk.com";
const ALLOWED_STATUSES = Object.freeze({
  disabled: 404,
  unrelated: 404,
  method: 405
});
function assertService(service) {
  if (!service || typeof service.fetch !== "function") throw Error("private_service_binding_required");
}
function assertOrigin(origin) {
  let url;
  try {url = new URL(origin)} catch {throw Error("reviewed_staging_origin_required")}
  if (url.href !== EXPECTED_ORIGIN + "/") throw Error("reviewed_staging_origin_required");
  return url.origin;
}
function requestFor(origin, path, method = "POST") {
  return new Request(origin + path, {
    method,
    headers: {"origin": origin, "content-type": "application/json", "x-thebe-qualification": "offline-private-acceptance"}
  });
}
async function invoke(service, request) {
  const result = await service.fetch(request);
  if (!(result instanceof Response)) throw Error("private_service_invalid_response");
  // Response bodies can contain sensitive error details; never read or log them.
  return result.status;
}
/** Only exercises no-credential, no-provider negative paths while feature is OFF.
 * Fail closed if unexpectedly enabled; never send a session cookie or real prompt.
 */
export async function verifyPrivateAiDisabled({ service, origin = EXPECTED_ORIGIN } = {}) {
  assertService(service);
  const reviewedOrigin = assertOrigin(origin);
  const scenarios = [
    {name: "disabled", path: "/api/ai/general", method: "POST"},
    {name: "unrelated", path: "/api/auth/register", method: "POST"},
    {name: "method", path: "/api/ai/general", method: "GET"}
  ];
  const outcomes = [];
  for (const scenario of scenarios) {
    const status = await invoke(service, requestFor(reviewedOrigin, scenario.path, scenario.method));
    outcomes.push({name: scenario.name, status});
    if (status !== ALLOWED_STATUSES[scenario.name]) {
      throw Error("private_staging_boundary_mismatch:" + scenario.name);
    }
  }
  return {ok: true, scope: "private-disabled-negative-paths-only", origin: reviewedOrigin,
    tested: outcomes.length, outcomes};
}

// A protected caller supplies its own short-lived synthetic session and owns
// fixture creation, cost authorization, and cleanup. This helper has no trigger.
export async function verifyPrivateAiResearch({service,origin=EXPECTED_ORIGIN,sessionToken,csrfToken}={}){
  assertService(service);
  const reviewedOrigin=assertOrigin(origin);
  const validToken=value=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
  if(!validToken(sessionToken)||!validToken(csrfToken))throw Error("synthetic_session_required");
  const call=async(cookie,csrf)=>{
    const headers={"origin":reviewedOrigin,"content-type":"application/json"};
    if(cookie)headers.cookie="__Host-bw_session="+cookie;
    if(csrf)headers["x-csrf-token"]=csrf;
    const response=await service.fetch(new Request(reviewedOrigin+"/api/ai/general",{
      method:"POST",headers,body:JSON.stringify({question:"Search the web for the capital of Botswana and cite one source in one sentence."})
    }));
    if(!(response instanceof Response))throw Error("private_service_invalid_response");
    return response;
  };
  for(const [cookie,proof,expected] of [[null,null,401],[sessionToken,"invalid",403]]){
    const response=await call(cookie,proof);
    await response.body?.cancel();
    if(response.status!==expected)throw Error("private_research_boundary_mismatch");
  }
  const response=await call(sessionToken,csrfToken);
  if(response.status!==200){
    await response.body?.cancel();
    throw Error("private_research_request_failed:"+response.status);
  }
  const result=await readBoundedProviderJson(response);
  const citations=validateResearchSources(result?.citations);
  if(result?.ok!==true||result.researchPerformed!==true||result.verification!=="provider_citations"||
     typeof result.answer!=="string"||!result.answer.trim()||citations.length===0)
    throw Error("private_research_citation_missing");
  return {ok:true,scope:"private-research",statuses:[401,403,200],citationCount:citations.length};
}
