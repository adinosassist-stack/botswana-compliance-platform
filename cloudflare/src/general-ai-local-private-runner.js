/** Local-only, no-provider negative-path acceptance runner.
 * No endpoint can be deployed as part of normal production/staging configs.
 * It refuses non-loopback host/origin and never forwards authentication.
 */
import {verifyPrivateAiDisabled} from "./general-ai-private-acceptance.js";
const disabled=(status=404)=>new Response(null,{status,headers:{"cache-control":"no-store"}});
export default {
  async fetch(request,env){
    if(!env?.LOCAL_PRIVATE_AI_TEST_ONLY || env.LOCAL_PRIVATE_AI_TEST_ONLY!=="true")return disabled();
    let url;
    try{url=new URL(request.url)}catch{return disabled(400)}
    if(!["127.0.0.1","localhost","[::1]"].includes(url.hostname))return disabled(403);
    if(url.pathname!=="/__local_ai_disabled_check" || request.method!=="POST")return disabled(404);
    if(request.headers.has("cookie")||request.headers.has("authorization"))return disabled(403);
    if(!env?.STAGING_AI?.fetch)return disabled(503);
    try{
      const result=await verifyPrivateAiDisabled({service:env.STAGING_AI});
      return new Response(JSON.stringify({ok:result.ok,tested:result.tested,scope:result.scope}),{
        status:200,headers:{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"}
      });
    }catch{return disabled(503)}
  }
};
