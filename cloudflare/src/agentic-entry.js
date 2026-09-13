import base from "./production-entry.js";
import {handleAgenticRequest} from "./agentic-core.js";
import {handleAgenticAuthorityRequest} from "./agentic-authority-core.js";

function logicalRequestPath(request){
  try{
    const url=new URL(request.url);
    if(url.pathname==="/"){
      const tunneled=url.searchParams.get("__thebe_api_path");
      if(tunneled)return String(tunneled);
    }
    if(url.pathname.startsWith("/__thebe_api/"))return `/api/${url.pathname.slice("/__thebe_api/".length)}`;
    if(url.pathname==="/__thebe_api")return "/api";
    return url.pathname;
  }catch{return ""}
}

export default {
  async fetch(request,env,ctx){
    const logicalPath=logicalRequestPath(request);
    const authorityResponse=await handleAgenticAuthorityRequest({request,logicalPath,env});
    if(authorityResponse)return authorityResponse;
    const response=await handleAgenticRequest({
      request,
      logicalPath,
      env,
      ctx,
      coreFetch:(innerRequest,innerEnv=env,innerCtx=ctx)=>base.fetch(innerRequest,innerEnv,innerCtx)
    });
    if(response)return response;
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    return base.scheduled(event,env,ctx);
  }
};

export {logicalRequestPath};
