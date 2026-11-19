/**
 * Issue #2672 — company-scoped logo upload behind a disabled-by-default gate.
 *
 * Shares the *existing* verified Cloudflare application session; never trusts
 * client-provided user IDs, company IDs, roles or headers as identity.
 *
 * This module does not mount itself. Production entrypoint must call it with
 * an INTERNAL /api/auth/me verifier, reviewed dedicated R2 binding, additive
 * D1 migration and explicit THEBE_COMPANY_LOGO_ENABLED=true.
 */
import {createQuotationLogoStore} from "../../server/quotation-logo-d1-r2-store.mjs";
import {handleQuotationLogoHttp} from "../../server/quotation-logo-http.mjs";
import {decodeAndSanitizeWebPngLogo} from "../../server/quotation-logo-web-png-sanitizer.mjs";

const LOGO_PATHS=new Set([
 "/api/quotation/logo",
 "/api/quotation/logo/upload",
 "/api/quotation/logo/image"
]);
const PAGE_PATHS=new Set([
 "/app/settings/company-logo",
 "/app/settings/company-logo/"
]);
const ROLE_WRITERS=new Set(["owner","manager"]);
const id=value=>typeof value==="string"&&/^[A-Za-z0-9_-]{8,100}$/.test(value);
const json=(code,status)=>new Response(JSON.stringify({ok:false,error:code}),{
 status,headers:{"content-type":"application/json; charset=utf-8",
  "cache-control":"no-store","x-content-type-options":"nosniff",
  "x-frame-options":"DENY","x-robots-tag":"noindex,nofollow"}
});
const denied=()=>new Response("Not found",{status:404,headers:{
 "cache-control":"no-store","x-robots-tag":"noindex,nofollow",
 "x-content-type-options":"nosniff"
}});
function validBoundStore(env){
 return typeof env?.DB?.prepare==="function"&&
  typeof env?.COMPANY_LOGOS?.get==="function"&&
  typeof env?.COMPANY_LOGOS?.put==="function"&&
  typeof env?.COMPANY_LOGOS?.delete==="function";
}
const cleanToken=(expected,actual)=>{
 if(typeof expected!=="string"||typeof actual!=="string"||
    expected.length<12||expected.length>4096||expected.length!==actual.length)return false;
 let delta=0;for(let i=0;i<actual.length;i++)delta|=actual.charCodeAt(i)^expected.charCodeAt(i);
 return delta===0;
};
const originAllowed=(request)=>{
 const target=new URL(request.url).origin;
 const fetchSite=request.headers.get("sec-fetch-site");
 if(fetchSite&&fetchSite!=="same-origin"&&fetchSite!=="none")return false;
 const from=request.headers.get("origin");
 return from===target; // No origin-less mutations, even with a matching CSRF token.
};
function page(){
 const html=`<!doctype html><html lang="en-BW"><head><meta charset="utf-8">
 <meta name="viewport" content="width=device-width,initial-scale=1">
 <meta name="robots" content="noindex,nofollow">
 <title>Company logo settings | Thebe Desk</title>
 <link rel="stylesheet" href="/assets/company-logo-settings.css">
 </head><body><main class="cls-shell">
 <a class="cls-back" href="/app/">← Back to Thebe Desk</a>
 <header><h1>Company logo</h1>
 <p>Upload a PNG, JPG or WebP image (maximum 2 MB). Your logo belongs to the currently signed-in business and can be replaced by an authorized manager or owner.</p></header>
 <section id="company-logo-status" role="status" aria-live="polite">Verifying your workspace…</section>
 <section id="company-logo-editor" aria-label="Upload and position your company logo"></section>
 <p class="cls-note">Your logo is saved privately to your business account once you select <strong>Save company logo</strong>. Invoice and quotation PDF integration will appear after separate release qualification.</p>
 </main><script defer src="/js/api-client.js"></script><script type="module" src="/js/company-logo-settings.mjs"></script></body></html>`;
 return new Response(html,{status:200,headers:{
  "content-type":"text/html; charset=utf-8","cache-control":"no-store",
  "x-content-type-options":"nosniff","x-frame-options":"DENY",
  "referrer-policy":"no-referrer","x-robots-tag":"noindex,nofollow",
  "content-security-policy":"default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"
 }});
}
export const companyLogoRoute=(pathname)=>LOGO_PATHS.has(pathname)||PAGE_PATHS.has(pathname);
/**
 * fetchSession(request) is only an internal authenticated call to the existing
 * Worker /__thebe_api/auth/me. The binding is private, not a caller-selected URL.
 */
export async function handleCompanyLogoRoute({request,env,fetchSession}={}){
 if(!(request instanceof Request))return null;
 const pathname=new URL(request.url).pathname;
 if(!companyLogoRoute(pathname))return null;
 if(env?.THEBE_COMPANY_LOGO_ENABLED!=="true")return denied();
 if(!["GET","POST","PUT"].includes(request.method))return json("method_not_allowed",405);
 if(PAGE_PATHS.has(pathname)&&request.method!=="GET")return json("method_not_allowed",405);
 if(!validBoundStore(env))return json("company_logo_storage_unavailable",503);
 if(typeof fetchSession!=="function")return json("company_logo_session_unavailable",503);
 // Never forward arbitrary attacker-controlled headers to the auth probe.
 const sessionHeaders=new Headers();
 for(const name of ["cookie","origin"]){
  const value=request.headers.get(name);
  if(value!==null)sessionHeaders.set(name,value);
 }
 const identityUrl=new URL("/__thebe_api/auth/me",request.url);
 let session;
 try{
  const response=await fetchSession(new Request(identityUrl,{headers:sessionHeaders}));
  if(!response?.ok)return json("company_logo_unauthenticated",401);
  session=await response.json();
 }catch{return json("company_logo_unauthenticated",401)}
 const actor=session?.user;
 if(!id(actor?.id)||!id(actor?.tenantId)||!ROLE_WRITERS.has(actor?.role)||
    session?.landingPath||typeof session?.csrfToken!=="string")
  return json("company_logo_permission_denied",403);
 const companyId=actor.tenantId; // derived from active authenticated membership
 if(PAGE_PATHS.has(pathname))return page();
 const isMutation=request.method==="PUT"||request.method==="POST";
 if(isMutation&&(!originAllowed(request)||!cleanToken(session.csrfToken,request.headers.get("x-csrf-token"))))
  return json("company_logo_csrf_denied",403);
 // The portable sanitizer accepts only PNG. JPG/WebP are converted by the
 // authenticated browser client; raw JPEG/other formats must never reach R2.
 if(request.method==="POST"&&pathname==="/api/quotation/logo/upload"&&
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="image/png")
  return json("unsupported_logo_type",415);
 if(isMutation){
  // A staging/production host must provide a rate-limit binding. Fail closed.
  if(typeof env.PUBLIC_RATE_LIMITER?.limit!=="function")return json("company_logo_rate_limit_unavailable",503);
  try{
   const result=await env.PUBLIC_RATE_LIMITER.limit({key:"company-logo:"+actor.id});
   if(result?.success!==true)return json("company_logo_rate_limited",429);
  }catch{return json("company_logo_rate_limit_unavailable",503)}
 }
 let store;try{store=createQuotationLogoStore({db:env.DB,bucket:env.COMPANY_LOGOS})}
 catch{return json("company_logo_storage_unavailable",503)}
 const scope=Object.freeze({tenantId:companyId,userId:actor.id,role:actor.role});
 const authorized=({actor:given,companyId:tenant})=>
  !!given&&given===scope&&tenant===companyId&&ROLE_WRITERS.has(scope.role);
 const authorization=Object.freeze({
  assertCompanyReader:async args=>authorized(args),
  assertCompanyEditor:async args=>authorized(args)
 });
 try{
  const response=await handleQuotationLogoHttp({
   request,actor:scope,companyId,authorization,store,
   verifyMutation:async()=>!isMutation||(originAllowed(request)&&
     cleanToken(session.csrfToken,request.headers.get("x-csrf-token"))),
   decodeAndSanitizeLogo:decodeAndSanitizeWebPngLogo
  });
  const headers=new Headers(response.headers);
  headers.set("cache-control","private, no-store");
  headers.set("x-content-type-options","nosniff");
  return new Response(response.body,{status:response.status,headers});
 }catch{return json("company_logo_request_failed",500)}
}
