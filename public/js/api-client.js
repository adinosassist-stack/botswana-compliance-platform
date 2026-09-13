(function bootstrapBwApi(global){
  "use strict";
  const CANONICAL_PRODUCTION_ORIGIN="https://thebedesk.com";
  const API_TUNNEL_PATH_PARAM="__thebe_api_path";
  const API_TUNNEL_QUERY_PARAM="__thebe_api_query";
  const API_SHADOW_PREFIX="/__thebe_api";
  const AUTH_TRANSPORT_PROBE_PATH="/api/auth/register-transport-probe";
  const AUTH_TRANSPORT_PROBE_RELEASE="20260906-registration-post-capability-v1";
  class ApiError extends Error{constructor(message,{status=0,code="request_failed",requestId="",data=null}={}){super(message);this.name="ApiError";this.status=status;this.code=code;this.requestId=requestId;this.data=data}}
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const AUTO_IDEMPOTENT_MUTATIONS=new Set([
    "POST /api/payments/create-checkout",
    "POST /api/evidence/presign",
    "POST /api/hr/cases",
    "POST /api/employees",
    "POST /api/daily-reporting/locations",
    "POST /api/daily-reporting/ai-summary",
    "POST /api/partner/tasks",
    "POST /api/compliance-schedules",
    "POST /api/ai/advisor",
    "POST /api/company-actions",
    "POST /api/licences",
    "POST /api/business-events/report"
  ]);
  function productionMode(){return String(global.document?.querySelector?.('meta[name="bw-runtime-mode"]')?.content||"production").toLowerCase()==="production"}
  function isLocalHostname(hostname){return ["localhost","127.0.0.1","::1"].includes(String(hostname||"").toLowerCase())}
  function enforceCanonicalProductionOrigin(){
    try{
      if(!productionMode()||!global.location?.href)return false;
      const current=new URL(global.location.href);
      if(current.origin===CANONICAL_PRODUCTION_ORIGIN)return false;
      if(isLocalHostname(current.hostname))return false;
      const destination=new URL(CANONICAL_PRODUCTION_ORIGIN);
      destination.pathname=current.pathname;
      destination.search=current.search;
      destination.hash=current.hash;
      if(typeof global.location.replace==="function"){global.location.replace(destination.href);return true}
      return false;
    }catch{return false}
  }
  enforceCanonicalProductionOrigin();
  function autoIdempotency(method,target){try{const path=new URL(target).pathname,key=`${method} ${path}`;return AUTO_IDEMPOTENT_MUTATIONS.has(key)||(method==="POST"&&(/^\/api\/company-actions\/[^/]+\/advance$/.test(path)||/^\/api\/licences\/[^/]+\/renew$/.test(path)))}catch{return false}}
  function friendlyMessage(status,data){
    const code=String(data?.error||"");
    const known={csrf_failed:"Your session security token changed. Refresh and try again.",origin_failed:"This request was blocked because it came from an unexpected origin.",unauthenticated:"Your session has expired. Please sign in again.",invalid_credentials:"Email or password is incorrect.",forbidden:"Your role does not have permission for that action.",workspace_role_forbidden:"Your account role cannot access this workspace action.",workspace_role_read_forbidden:"Your role cannot view that information.",workspace_role_mutation_forbidden:"Your role cannot change that information.",invalid_registration:"Check your company name, email and password. Company name must be at least 2 characters and the password must be at least 12 characters.",human_verification_failed:"Human verification failed or expired. Complete the verification and try again.",database_daily_limit_reached:"The database has reached its daily service limit. Try again after the limit resets."};
    return known[code]||String(data?.message||data?.error||((status>=500)?"The service could not complete the request. Please retry.":`Request failed (${status||"network"}).`));
  }
  function registrationValidationMessage(target,method,body){
    try{
      if(method!=="POST"||new URL(target).pathname!=="/api/auth/register"||typeof body!=="string")return "";
      const data=JSON.parse(body),companyName=String(data?.companyName||"").trim(),email=String(data?.email||"").trim(),password=String(data?.password||"");
      if(companyName.length<2||companyName.length>160)return "Enter a company name between 2 and 160 characters.";
      if(email.length>254||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(email))return "Enter a valid email address.";
      if(password.length<12)return "Create a password with at least 12 characters.";
      if(password.length>200)return "Password is too long. Use 200 characters or fewer.";
      return "";
    }catch{return ""}
  }
  function createClient({getCsrfToken=()=>"",onUnauthorized=()=>{},onError=()=>{},timeoutMs=18000,retries=1}={}){
    let preferredTransport="root";
    function apiUrl(value){
      const base=global.location?.href||"https://invalid.local/",target=new URL(String(value||""),base);
      if(!global.location?.origin||target.origin!==global.location.origin)throw new ApiError("Blocked cross-origin application API request.",{code:"cross_origin_api_blocked"});
      if(productionMode()&&!isLocalHostname(target.hostname)&&(target.protocol!=="https:"||target.origin!==CANONICAL_PRODUCTION_ORIGIN))throw new ApiError("Thebe Desk is switching this session to its secure production address. Reload once if it does not continue automatically.",{code:"canonical_origin_required"});
      return target.href;
    }
    function isLogicalApiTarget(logicalTarget){const target=new URL(logicalTarget);return target.pathname==="/api"||target.pathname.startsWith("/api/")}
    function isAuthCredentialMutation(logicalTarget,method){if(method!=="POST")return false;const path=new URL(logicalTarget).pathname;return path==="/api/auth/register"||path==="/api/auth/login"}
    function rootTransportApiUrl(logicalTarget){
      const target=new URL(logicalTarget);
      if(!isLogicalApiTarget(logicalTarget))return target.href;
      const transport=new URL("/",target.origin);
      transport.searchParams.set(API_TUNNEL_PATH_PARAM,target.pathname);
      if(target.search.length>1)transport.searchParams.set(API_TUNNEL_QUERY_PARAM,target.search.slice(1));
      return transport.href;
    }
    function shadowTransportApiUrl(logicalTarget){
      const target=new URL(logicalTarget);
      if(!isLogicalApiTarget(logicalTarget))return target.href;
      target.pathname=target.pathname==="/api"?API_SHADOW_PREFIX:`${API_SHADOW_PREFIX}${target.pathname.slice(4)}`;
      return target.href;
    }
    function transportApiUrl(logicalTarget,transport="root"){
      if(transport==="direct")return logicalTarget;
      if(transport==="shadow")return shadowTransportApiUrl(logicalTarget);
      return rootTransportApiUrl(logicalTarget);
    }
    function transportCandidates(logicalTarget){
      if(!isLogicalApiTarget(logicalTarget))return [{name:"direct",url:logicalTarget}];
      const all=["root","shadow","direct"].map(name=>({name,url:transportApiUrl(logicalTarget,name)}));
      const preferred=all.find(x=>x.name===preferredTransport)||all[0];
      return [preferred,...all.filter(x=>x!==preferred)];
    }
    function transportRouteRejected(response){return response?.status===404||response?.status===405}
    function uploadUrl(value){
      const base=global.location?.href||"https://invalid.local/",target=new URL(String(value||""),base);
      const localHttp=target.protocol==="http:"&&isLocalHostname(target.hostname);
      if(target.protocol!=="https:"&&!localHttp)throw new ApiError("Blocked insecure upload destination.",{code:"insecure_upload_destination"});
      return target.href;
    }
    async function fetchApi(target,fetchOptions,method,headers,signal){
      const response=await fetch(target,{...fetchOptions,method,headers,credentials:"same-origin",signal,redirect:"error"});
      let data={};const type=response.headers.get("content-type")||"";
      if(type.includes("application/json")){try{data=await response.json()}catch{data={}}}
      else{const text=await response.text().catch(()=>"");data=text?{message:text.slice(0,600)}:{}}
      return {response,data};
    }
    async function probeIdempotentTransports(logicalTarget,fetchOptions,method,headers,signal,requestId){
      let firstNetworkError=null;
      for(const candidate of transportCandidates(logicalTarget)){
        try{
          const result=await fetchApi(candidate.url,fetchOptions,method,headers,signal);
          if(transportRouteRejected(result.response))continue;
          preferredTransport=candidate.name;
          return result;
        }catch(error){
          if(error?.name==="AbortError")throw error;
          if(!firstNetworkError)firstNetworkError=error;
        }
      }
      if(firstNetworkError)throw firstNetworkError;
      throw new ApiError("Thebe Desk application service route is unavailable. Refresh and try again.",{status:0,code:"api_transport_unavailable",requestId});
    }
    async function probeAuthMutationTransport(logicalTarget,fetchOptions,method,headers,signal,requestId){
      let firstNetworkError=null;
      const probeTarget=new URL(AUTH_TRANSPORT_PROBE_PATH,logicalTarget).href;
      const probeOptions={...fetchOptions};delete probeOptions.body;delete probeOptions.idempotencyKey;
      const expectedTransport={root:"root_tunnel",shadow:"shadow_path",direct:"direct"};
      for(const candidate of transportCandidates(logicalTarget)){
        const probeHeaders=new Headers(headers);
        probeHeaders.delete("idempotency-key");
        probeHeaders.delete("x-csrf-token");
        try{
          const result=await fetchApi(transportApiUrl(probeTarget,candidate.name),probeOptions,method,probeHeaders,signal);
          if(transportRouteRejected(result.response))continue;
          if(!result.response.ok){
            throw new ApiError(friendlyMessage(result.response.status,result.data),{status:result.response.status,code:String(result.data?.error||"auth_transport_probe_failed"),requestId,data:result.data});
          }
          if(result.data?.ok!==true||result.data?.release!==AUTH_TRANSPORT_PROBE_RELEASE||result.data?.transport!==expectedTransport[candidate.name])throw new ApiError("The sign-in service could not verify a safe request route. Refresh and try again.",{status:0,code:"auth_transport_probe_unverified",requestId,data:result.data});
          preferredTransport=candidate.name;
          return candidate.name;
        }catch(error){
          if(error?.name==="AbortError")throw error;
          if(error instanceof ApiError)throw error;
          if(!firstNetworkError)firstNetworkError=error;
        }
      }
      if(firstNetworkError)throw firstNetworkError;
      throw new ApiError("Thebe Desk sign-in service route is unavailable. Refresh and try again.",{status:0,code:"auth_transport_unavailable",requestId});
    }
    async function request(url,options={}){
      const logicalTarget=apiUrl(url),method=String(options.method||"GET").toUpperCase(),idempotent=["GET","HEAD"].includes(method),authCredentialMutation=isAuthCredentialMutation(logicalTarget,method),requestId=global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
      const registrationError=registrationValidationMessage(logicalTarget,method,options.body);if(registrationError)throw new ApiError(registrationError,{status:400,code:"invalid_registration",requestId});
      const requestedIdempotency=options.idempotencyKey??autoIdempotency(method,logicalTarget),idempotencyKey=requestedIdempotency===true?(global.crypto?.randomUUID?.()||requestId):String(requestedIdempotency||"").trim();
      const safeRetry=idempotent||!!idempotencyKey,attempts=safeRetry?Math.max(1,retries+1):1;
      const fetchOptions={...options};delete fetchOptions.idempotencyKey;
      let lastError;
      for(let attempt=0;attempt<attempts;attempt++){
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort("timeout"),timeoutMs);
        const headers=new Headers(options.headers||{});headers.set("accept","application/json");headers.set("x-client-request-id",requestId);
        if(idempotencyKey)headers.set("idempotency-key",idempotencyKey);
        if(options.body!=null&&!headers.has("content-type")&&!(options.body instanceof FormData))headers.set("content-type","application/json");
        if(!idempotent){const csrf=String(getCsrfToken()||"");if(csrf)headers.set("x-csrf-token",csrf)}
        try{
          let result;
          if(idempotent){
            result=await probeIdempotentTransports(logicalTarget,fetchOptions,method,headers,controller.signal,requestId);
          }else{
            if(authCredentialMutation)await probeAuthMutationTransport(logicalTarget,fetchOptions,method,headers,controller.signal,requestId);
            result=await fetchApi(transportApiUrl(logicalTarget,preferredTransport),fetchOptions,method,headers,controller.signal);
          }
          clearTimeout(timer);const {response,data}=result;
          if(response.status===401){try{onUnauthorized()}catch{}}
          if(response.ok)return data;
          const routeChanged=authCredentialMutation&&transportRouteRejected(response);
          const err=routeChanged
            ?new ApiError("The sign-in service route changed before the request completed. Refresh and try again. The account request was not automatically repeated.",{status:response.status,code:"auth_transport_changed",requestId,data})
            :new ApiError(friendlyMessage(response.status,data),{status:response.status,code:String(data?.error||"request_failed"),requestId,data});
          if(safeRetry&&attempt+1<attempts&&[425,429,502,503,504].includes(response.status)){lastError=err;await sleep(200*(attempt+1));continue}
          throw err;
        }catch(error){
          clearTimeout(timer);
          const err=error instanceof ApiError?error:new ApiError(error?.name==="AbortError"?"The request timed out. Please retry.":"Network connection failed. Check connectivity and retry.",{status:0,code:error?.name==="AbortError"?"timeout":"network_error",requestId});
          if(safeRetry&&attempt+1<attempts&&!(error instanceof ApiError)){lastError=err;await sleep(200*(attempt+1));continue}
          try{console.error("BW API request failed",{url:logicalTarget,method,status:err.status,code:err.code,requestId});onError(err,{url:logicalTarget,method,requestId})}catch{}
          throw err;
        }
      }
      throw lastError||new ApiError("Request failed",{requestId});
    }
    async function uploadPresigned(url,{body,contentType="application/octet-stream",timeout=timeoutMs}={}){
      const target=uploadUrl(url),controller=new AbortController(),timer=setTimeout(()=>controller.abort("timeout"),timeout);
      try{
        const response=await fetch(target,{method:"PUT",headers:{"content-type":String(contentType||"application/octet-stream")},body,credentials:"omit",signal:controller.signal,redirect:"error",referrerPolicy:"no-referrer"});
        if(response.ok)return {ok:true,status:response.status};
        throw new ApiError(`Secure file upload failed (${response.status}).`,{status:response.status,code:"presigned_upload_failed"});
      }catch(error){
        const err=error instanceof ApiError?error:new ApiError(error?.name==="AbortError"?"Secure file upload timed out. Please retry.":"Secure file upload failed. Check connectivity and retry.",{status:0,code:error?.name==="AbortError"?"upload_timeout":"upload_network_error"});
        try{console.error("BW presigned upload failed",{status:err.status,code:err.code})}catch{}
        throw err;
      }finally{clearTimeout(timer)}
    }
    return Object.freeze({request,uploadPresigned});
  }
  global.BW=global.BW||{};global.BW.api=Object.freeze({ApiError,createClient});
})(window);

(function loadOwnerWhatsAppPrepare(global){
  "use strict";
  if(!global.document||global.document.querySelector('script[data-thebe-owner-whatsapp-prepare]'))return;
  const script=global.document.createElement("script");
  script.src="/js/owner-whatsapp-prepare.js";
  script.defer=true;
  script.dataset.thebeOwnerWhatsappPrepare="20260914a";
  (global.document.head||global.document.documentElement).append(script);
})(window);
