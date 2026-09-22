import worker from "./worker.js";
import {handleAgenticRequest} from "./agentic-core.js";
import {durableRegistrationChallengeGate,registrationClientIp,registrationProofSecret,validateAndClaimRegistrationProof} from "./registration-boundary.js";

const TURNSTILE_ORIGIN="https://challenges.cloudflare.com";
const TURNSTILE_VERIFY_URL=`${TURNSTILE_ORIGIN}/turnstile/v0/siteverify`;
const LEGACY_TURNSTILE_CONFIGURATION_ERROR="turnstile_configuration_error";
const META_CSP_RE=/<meta\b(?=[^>]*\bhttp-equiv\s*=\s*["']Content-Security-Policy["'])[^>]*>/i;
const ICON_LINK_RE=/<link\b(?=[^>]*\brel\s*=\s*["'](?:icon|shortcut icon|apple-touch-icon)["'])[^>]*>\s*/gi;
const THEBE_LOGO_FAVICON="/assets/thebe-desk-favicon-512.png?v=20260912b";
const OWNER_COMMAND_CENTRE_RELEASE="20260913c";
const EXECUTIVE_PERSONALIZATION_RELEASE="20260913c";
const BUSINESS_DATA_BRIDGE_RELEASE="20260913d";
const THEBE_LIVE_VOICE_RELEASE="20260921c";
const THEBE_PUBLIC_API_CLIENT_RELEASE="20260920a";
const THEBE_AI_DOCK_RELEASE="20260921c";
const WORKSPACE_RUNTIME_ASSET="/js/workspace-runtime-20260922a.js";
const WORKSPACE_STYLES_ASSET="/assets/workspace-inline-styles-20260921a.css";
const WORKSPACE_VIEW_FRAGMENT_SHARD_COUNT=12;
const WORKSPACE_VIEW_FRAGMENT_PREFIX="/assets/workspace-view-fragments-20260921d-";
const WORKSPACE_RESIDENT_VIEW_IDS=Object.freeze(["dashboard","workhub","sites","peopleops","businesshub","obligations","evidencehub","automationhub"]);
const WORKSPACE_LAZY_VIEW_IDS=Object.freeze(["tenderhub","accounthub","employer","employees","dailyreports","privacy","tender","events","manufacturing","sources","taxprofile","bwreadiness","corporate","employmentcontrols","publishing","calendar","vault","documents","changes","audit","rules","expert","security","integrations","billing","accountsocial","accountsecurity","accountdata","tenderready","protectionengine","employershield","companysecretary","compliancepassport","licenceos","partnerportal","workflowhub","aiservices","aicontrols","notifications","recurringautomation","servicesmarketplace","payments","entitlements","regulatoryintel","regulatoryobligations","inspectionreadiness","datadeletion","evidenceintegrity","controlcenter","riskengine","portfolioRisk","industryintel","assurancefreshness","auditintegrity","controllineage","regulatorygovernance","statutorycalendar","businessevents","partneractioncenter","profile"]);
const TURNSTILE_SECRET_HEALTH_TTL_MS=5*60*1000;
const REGISTRATION_PROOF_TTL_MS=5*60*1000;
const REGISTRATION_PROOF_DIFFICULTY=10;
let turnstileSecretHealthCache={checkedAt:0,result:null};

const FIRST_PARTY_CLIENT_BLOCK=String.raw`
let turnstileWidgetId=null,turnstileToken="",turnstileConfig=null,turnstileLoadPromise=null,turnstileExecutionResolve=null,turnstileExecutionReject=null;
function loadTurnstileScript(){return Promise.resolve(null)}
function settleTurnstileExecution(token,error=null){turnstileToken=String(token||"");if(error)throw error;return turnstileToken}
function registrationProofLeadingZeroBits(bytes,bits){
 let remaining=Number(bits)||0;
 for(const value of bytes){
  if(remaining<=0)return true;
  const take=Math.min(8,remaining);
  if((value>>(8-take))!==0)return false;
  remaining-=take;
 }
 return remaining<=0
}
async function ensureRegistrationChallenge(){
 if(STANDALONE_PREVIEW)return;
 const field=document.getElementById("turnstileField");
 if(field)field.hidden=true;
 if(authMode!=="register"){turnstileToken="";turnstileConfig=null;return}
 turnstileConfig={required:true,provider:"thebe_proof",action:"register"};
 if(field&&!document.getElementById("registrationWebsite")){
  const trap=document.createElement("input");
  trap.id="registrationWebsite";
  trap.name="website";
  trap.type="text";
  trap.tabIndex=-1;
  trap.autocomplete="off";
  trap.setAttribute("aria-hidden","true");
  trap.style.position="absolute";
  trap.style.left="-10000px";
  trap.style.width="1px";
  trap.style.height="1px";
  trap.style.opacity="0";
  field.appendChild(trap)
 }
}
async function freshRegistrationTurnstileToken(){
 await ensureRegistrationChallenge();
 const challenge=await productionApiClient.request("/api/auth/registration-proof/challenge",{
  method:"POST",
  headers:{"content-type":"application/json"},
  body:"{}"
 });
 const token=String(challenge?.token||"");
 const difficulty=Number(challenge?.difficulty||0);
 if(!token||difficulty<8||difficulty>16)throw new Error("Registration protection is not ready. Try again.");
 const encoder=new TextEncoder();
 for(let counter=0;counter<500000;counter++){
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(token+":"+counter)));
  if(registrationProofLeadingZeroBits(digest,difficulty)){
   turnstileToken=JSON.stringify({
    challenge:token,
    counter,
    honeypot:String(document.getElementById("registrationWebsite")?.value||"")
   });
   return turnstileToken
  }
  if(counter>0&&counter%512===0)await new Promise(resolve=>setTimeout(resolve,0))
 }
 throw new Error("Registration protection took too long. Click Create account again.")
}
`;

function turnstileCspReady(headers){
  const csp=String(headers?.get?.("content-security-policy")||"");
  return csp.includes(TURNSTILE_ORIGIN)&&csp.includes(`frame-src ${TURNSTILE_ORIGIN}`);
}

function stripConflictingMetaCsp(html){
  return String(html||"").replace(META_CSP_RE,"");
}

function injectBeforeFinalClosingTag(html,tag,markup){
  const source=String(html||"");
  const closing=`</${String(tag||"").toLowerCase()}>`;
  const index=source.toLowerCase().lastIndexOf(closing);
  if(index<0)return source;
  return source.slice(0,index)+String(markup||"")+source.slice(index);
}

function injectLogoFavicon(html){
  const source=String(html||"");
  if(!source.toLowerCase().includes("</head>"))return source;
  const withoutOldIcons=source.replace(ICON_LINK_RE,"");
  const faviconMarkup=`<link rel="icon" type="image/png" sizes="512x512" href="${THEBE_LOGO_FAVICON}" />\n<link rel="apple-touch-icon" href="${THEBE_LOGO_FAVICON}" />\n`;
  return injectBeforeFinalClosingTag(withoutOldIcons,"head",faviconMarkup);
}

function injectPublicThebeAssets(html){
  let source=String(html||"");
  const lower=source.toLowerCase();
  if(!lower.includes("</head>")||!lower.includes("</body>"))return source;
  const liveVoiceJsSrc=`/js/thebe-live-voice.js?v=${THEBE_LIVE_VOICE_RELEASE}`;
  const publicApiClientJsSrc=`/js/api-client.js?v=${THEBE_PUBLIC_API_CLIENT_RELEASE}`;
  const aiDockCssHref=`/assets/thebe-ai-dock.css?v=${THEBE_AI_DOCK_RELEASE}`;
  if(!source.includes("/assets/thebe-ai-dock.css"))source=injectBeforeFinalClosingTag(source,"head",`<link rel="stylesheet" href="${aiDockCssHref}" />\n`);
  if(!source.includes("/js/api-client.js"))source=injectBeforeFinalClosingTag(source,"body",`<script src="${publicApiClientJsSrc}" defer></script>\n`);
  if(!source.includes("/js/thebe-live-voice.js"))source=injectBeforeFinalClosingTag(source,"body",`<script src="${liveVoiceJsSrc}" defer></script>\n`);
  return source;
}

function externalizeWorkspaceRuntime(html){
  const source=String(html||"");
  const pattern=/<script\b(?=[^>]*\bid=["']thebe-workspace-runtime-inline["'])[^>]*>[\s\S]*?<\/script>/i;
  if(!pattern.test(source))return source;
  return source.replace(pattern,`<script id="thebe-workspace-runtime" src="${WORKSPACE_RUNTIME_ASSET}"></script>`);
}

function externalizeWorkspaceHeadStyles(html){
  const source=String(html||"");
  const headEnd=source.toLowerCase().indexOf("</head>");
  if(headEnd<0)return source;
  const head=source.slice(0,headEnd);
  const tail=source.slice(headEnd);
  const pattern=/<style\b[^>]*>[\s\S]*?<\/style>/gi;
  let count=0;
  const rewritten=head.replace(pattern,()=>{
    count+=1;
    return count===1?`<link id="thebe-workspace-inline-styles" rel="stylesheet" href="${WORKSPACE_STYLES_ASSET}" />`:"";
  });
  return count?rewritten+tail:source;
}

function findMatchingSectionBounds(source,start){
  const openEnd=source.indexOf(">",start)+1;
  if(openEnd<=0)return null;
  const token=/<\/?section\b[^>]*>/gi;
  token.lastIndex=start;
  let depth=0,match;
  while((match=token.exec(source))){
    if(/^<section\b/i.test(match[0]))depth+=1;
    else depth-=1;
    if(depth===0)return {openEnd,closeStart:match.index,end:token.lastIndex};
  }
  return null;
}

function externalizeWorkspaceViews(html){
  const source=String(html||"");
  const replacements=[];
  for(const id of WORKSPACE_LAZY_VIEW_IDS){
    const pattern=new RegExp(`<section\\b[^>]*\\bid=["']${id}["'][^>]*>`,"i");
    const match=pattern.exec(source);
    if(!match)return source;
    const bounds=findMatchingSectionBounds(source,match.index);
    if(!bounds)return source;
    const openTag=source.slice(match.index,bounds.openEnd);
    const placeholder=`${openTag.slice(0,-1)} data-lazy-view="1" data-lazy-view-id="${id}" aria-busy="false"></section>`;
    replacements.push({start:match.index,end:bounds.end,placeholder});
  }
  if(replacements.length!==WORKSPACE_LAZY_VIEW_IDS.length)return source;
  let transformed=source;
  for(const replacement of replacements.sort((a,b)=>b.start-a.start)){
    transformed=transformed.slice(0,replacement.start)+replacement.placeholder+transformed.slice(replacement.end);
  }
  return transformed;
}

function injectWorkspaceLazyViewClient(runtime){
  let source=String(runtime||"");
  const marker='let lastWorkspaceView="dashboard";';
  if(!source.includes(marker))return source;
  const hydrationBlock=`
const WORKSPACE_VIEW_FRAGMENT_SHARD_COUNT=12;
const WORKSPACE_VIEW_FRAGMENT_PREFIX="/assets/workspace-view-fragments-20260921d-";
const workspaceViewShardPromises=new Map();
let workspaceViewNavigationEpoch=0;
function workspaceViewShard(id){
  let hash=0;
  const value=String(id||"");
  for(let i=0;i<value.length;i++)hash=(Math.imul(hash,31)+value.charCodeAt(i))>>>0;
  return hash%WORKSPACE_VIEW_FRAGMENT_SHARD_COUNT;
}
async function workspaceViewFragments(id){
  const shard=workspaceViewShard(id);
  if(workspaceViewShardPromises.has(shard))return workspaceViewShardPromises.get(shard);
  const asset=WORKSPACE_VIEW_FRAGMENT_PREFIX+shard+".json";
  const promise=fetch(asset,{method:"GET",credentials:"same-origin",cache:"force-cache"}).then(async response=>{
    if(!response.ok)throw new Error("Workspace view shard is unavailable.");
    const payload=await response.json();
    if(!payload||payload.schema!==2||payload.shard!==shard||!payload.views||typeof payload.views!=="object")throw new Error("Workspace view shard is invalid.");
    return payload.views;
  }).catch(error=>{workspaceViewShardPromises.delete(shard);throw error});
  workspaceViewShardPromises.set(shard,promise);
  return promise;
}
function lazyWorkspaceViewLabel(id){
  const meta=typeof COMMAND_META!=="undefined"?COMMAND_META[id]:null;
  const nav=document.querySelector('[data-view="'+String(id||"")+'"]');
  return String(meta?.[0]||nav?.textContent?.trim()||"Workspace");
}
function setLazyWorkspaceMessage(target,title,detail,bad=false){
  if(!target)return;
  target.replaceChildren();
  const card=document.createElement("div");
  card.className=bad?"notice bad":"card";
  const heading=document.createElement("h2");
  heading.textContent=String(title||"");
  const copy=document.createElement("div");
  copy.className="muted small";
  copy.textContent=String(detail||"");
  card.append(heading,copy);
  target.append(card);
}
function activateLazyWorkspacePlaceholder(id,target){
  lastWorkspaceView=id;
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  target.classList.add("active");
  document.querySelectorAll(".nav button").forEach(b=>{
    const active=b.dataset.view===id;
    b.classList.toggle("active",active);
    if(active)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");
  });
  const label=lazyWorkspaceViewLabel(id);
  const pageTitle=document.getElementById("pageTitle");
  if(pageTitle)pageTitle.textContent=label;
  updateMobileNav(id);
  const status=document.getElementById("srStatus");
  if(status)status.textContent="Loading "+label+"…";
  setLazyWorkspaceMessage(target,"Loading "+label+"…","Fetching this workspace area.");
  window.scrollTo({top:0,behavior:prefersReducedMotion()?"auto":"smooth"});
}
async function hydrateLazyWorkspaceView(id,target,options={}){
  if(!target||target.dataset.lazyView!=="1")return false;
  if(target.dataset.lazyLoading==="1")return true;
  target.dataset.lazyLoading="1";
  delete target.dataset.lazyError;
  target.setAttribute("aria-busy","true");
  const status=document.getElementById("srStatus");
  if(status)status.textContent="Loading "+String(id||"workspace")+"…";
  try{
    const views=await workspaceViewFragments(id);
    const markup=Object.prototype.hasOwnProperty.call(views,id)?views[id]:null;
    if(typeof markup!=="string")throw new Error("Workspace view is unavailable.");
    if(!window.BW?.dom?.renderMarkup)throw new Error("Workspace DOM safety layer is unavailable.");
    window.BW.dom.renderMarkup(target,markup);
    target.dataset.lazyHydrated="1";
    delete target.dataset.lazyError;
    target.removeAttribute("data-lazy-view");
    target.removeAttribute("data-lazy-view-id");
    target.setAttribute("aria-busy","false");
    delete target.dataset.lazyLoading;
    const requestedEpoch=Number(target.dataset.lazyNavigationEpoch||0);
    delete target.dataset.lazyNavigationEpoch;
    if(requestedEpoch!==workspaceViewNavigationEpoch)return true;
    return showView(id,{...options,lazyHydrated:true,preserveNavigationEpoch:true});
  }catch(error){
    target.setAttribute("aria-busy","false");
    delete target.dataset.lazyLoading;
    console.error("workspace_lazy_view_hydration_failed",{view:id,error});
    if(Number(target.dataset.lazyNavigationEpoch||0)===workspaceViewNavigationEpoch){
      target.dataset.lazyError="1";
      const label=lazyWorkspaceViewLabel(id);
      setLazyWorkspaceMessage(target,label+" could not be loaded","Try this section again. The previous workspace view is no longer being shown.",true);
      if(status)status.textContent="This workspace area could not be loaded. Try again.";
    }
    return false;
  }
}
`;
  source=source.replace(marker,hydrationBlock+"\n"+marker);
  const targetNeedle='const target=document.getElementById(id);if(!target){console.warn("Unknown view",id);return false}lastWorkspaceView=id;';
  if(!source.includes(targetNeedle))return String(runtime||"");
  source=source.replace(targetNeedle,'const target=document.getElementById(id);if(!target){console.warn("Unknown view",id);return false}const workspaceNavigationEpoch=options?.preserveNavigationEpoch===true?workspaceViewNavigationEpoch:++workspaceViewNavigationEpoch;if(target.dataset.lazyView==="1"&&options?.lazyHydrated!==true){target.dataset.lazyNavigationEpoch=String(workspaceNavigationEpoch);activateLazyWorkspacePlaceholder(id,target);void hydrateLazyWorkspaceView(id,target,options);return true}lastWorkspaceView=id;');
  return source;
}


function injectOwnerCommandCentreAssets(html){
  let source=String(html||"");
  const lower=source.toLowerCase();
  if(!lower.includes("</head>")||!lower.includes("</body>"))return source;
  const cssHref=`/assets/owner-command-centre.css?v=${OWNER_COMMAND_CENTRE_RELEASE}`;
  const jsSrc=`/js/owner-command-centre.js?v=${OWNER_COMMAND_CENTRE_RELEASE}`;
  const personalizationCssHref=`/assets/executive-personalization.css?v=${EXECUTIVE_PERSONALIZATION_RELEASE}`;
  const personalizationJsSrc=`/js/executive-personalization.js?v=${EXECUTIVE_PERSONALIZATION_RELEASE}`;
  const bridgeCssHref=`/assets/business-data-bridge.css?v=${BUSINESS_DATA_BRIDGE_RELEASE}`;
  const bridgeJsSrc=`/js/business-data-bridge.js?v=${BUSINESS_DATA_BRIDGE_RELEASE}`;
  const liveVoiceJsSrc=`/js/thebe-live-voice.js?v=${THEBE_LIVE_VOICE_RELEASE}`;
  const publicApiClientJsSrc=`/js/api-client.js?v=${THEBE_PUBLIC_API_CLIENT_RELEASE}`;
  const aiDockCssHref=`/assets/thebe-ai-dock.css?v=${THEBE_AI_DOCK_RELEASE}`;
  if(!source.includes("/assets/owner-command-centre.css"))source=injectBeforeFinalClosingTag(source,"head",`<link rel="stylesheet" href="${cssHref}" />\n`);
  if(!source.includes("/assets/executive-personalization.css"))source=injectBeforeFinalClosingTag(source,"head",`<link rel="stylesheet" href="${personalizationCssHref}" />\n`);
  if(!source.includes("/assets/business-data-bridge.css"))source=injectBeforeFinalClosingTag(source,"head",`<link rel="stylesheet" href="${bridgeCssHref}" />\n`);
  if(!source.includes("/assets/thebe-ai-dock.css"))source=injectBeforeFinalClosingTag(source,"head",`<link rel="stylesheet" href="${aiDockCssHref}" />\n`);
  if(!source.includes("/js/api-client.js"))source=injectBeforeFinalClosingTag(source,"body",`<script src="${publicApiClientJsSrc}" defer></script>\n`);
  if(!source.includes("/js/owner-command-centre.js"))source=injectBeforeFinalClosingTag(source,"body",`<script src="${jsSrc}" defer></script>\n`);
  if(!source.includes("/js/executive-personalization.js"))source=injectBeforeFinalClosingTag(source,"body",`<script src="${personalizationJsSrc}" defer></script>\n`);
  if(!source.includes("/js/business-data-bridge.js"))source=injectBeforeFinalClosingTag(source,"body",`<script src="${bridgeJsSrc}" defer></script>\n`);
  if(!source.includes("/js/thebe-live-voice.js"))source=injectBeforeFinalClosingTag(source,"body",`<script src="${liveVoiceJsSrc}" defer></script>\n`);
  return source;
}

function injectFirstPartyRegistrationClient(html){
  const source=String(html||"");
  const start=source.indexOf("let turnstileWidgetId=");
  if(start<0)return source;
  const end=source.indexOf("function clearWorkspaceChoice(){",start);
  if(end<0)return source;
  return source.slice(0,start)+FIRST_PARTY_CLIENT_BLOCK+"\n"+source.slice(end);
}

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

function isRegistrationRequest(request){
  return String(request?.method||"").toUpperCase()==="POST"&&logicalRequestPath(request)==="/api/auth/register";
}

function isRegistrationProofChallengeRequest(request){
  return String(request?.method||"").toUpperCase()==="POST"&&logicalRequestPath(request)==="/api/auth/registration-proof/challenge";
}

function jsonResponse(data,status,headers={}){
  return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...headers}});
}

function base64UrlEncodeText(value){
  const bytes=new TextEncoder().encode(String(value));
  let binary="";
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}

async function hmacHex(secret,value){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

function registrationOriginAllowed(request,env){
  const origin=String(request.headers.get("origin")||"").trim();
  if(!origin)return true;
  try{
    const configured=new URL(String(env?.PUBLIC_ORIGIN||env?.PUBLIC_APP_URL||""));
    return new URL(origin).origin===configured.origin;
  }catch{return false}
}

async function createRegistrationProofChallenge(request,env){
  if(!registrationOriginAllowed(request,env))return jsonResponse({error:"origin_failed"},403);
  if(env?.__THEBE_REGISTRATION_CHALLENGE_BUDGET_VERIFIED!==true){
    const challengeGate=await durableRegistrationChallengeGate(request,env);
    if(challengeGate)return challengeGate;
  }
  const secret=registrationProofSecret(env);
  if(!secret)return jsonResponse({error:"registration_protection_unavailable",message:"Registration protection is temporarily unavailable."},503,{"retry-after":"60"});
  const now=Date.now(),bytes=crypto.getRandomValues(new Uint8Array(18));
  let nonce="";
  for(const byte of bytes)nonce+=byte.toString(16).padStart(2,"0");
  const ip=registrationClientIp(request);
  const ipTag=(await hmacHex(secret,`registration-ip:${ip||"unknown"}`)).slice(0,24);
  const payload={v:1,n:nonce,iat:now,exp:now+REGISTRATION_PROOF_TTL_MS,b:REGISTRATION_PROOF_DIFFICULTY,ip:ipTag};
  const encoded=base64UrlEncodeText(JSON.stringify(payload));
  const signature=await hmacHex(secret,`registration-challenge:${encoded}`);
  return jsonResponse({provider:"thebe_proof",required:true,action:"register",token:`${encoded}.${signature}`,difficulty:REGISTRATION_PROOF_DIFFICULTY,expiresInSeconds:Math.floor(REGISTRATION_PROOF_TTL_MS/1000)},200);
}

const verifyRegistrationProof=validateAndClaimRegistrationProof;

async function turnstileSecretHealth(env){
  const secret=String(env?.TURNSTILE_SECRET_KEY||"").trim();
  if(secret.length<20)return {ok:false,reason:"secret_missing_or_weak"};
  const now=Date.now();
  if(turnstileSecretHealthCache.result&&now-turnstileSecretHealthCache.checkedAt<TURNSTILE_SECRET_HEALTH_TTL_MS)return turnstileSecretHealthCache.result;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort("turnstile_secret_health_timeout"),5000);
  try{
    const body=new URLSearchParams({secret});
    const response=await fetch(TURNSTILE_VERIFY_URL,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body,signal:controller.signal,redirect:"error"});
    if(!response.ok)return {ok:null,reason:`siteverify_http_${response.status}`};
    const result=await response.json();
    const errors=Array.isArray(result?.["error-codes"])?result["error-codes"].map(String):[];
    const health=errors.includes("invalid-input-secret")||errors.includes("missing-input-secret")
      ?{ok:false,reason:LEGACY_TURNSTILE_CONFIGURATION_ERROR}
      :errors.includes("missing-input-response")
        ?{ok:true,reason:"secret_accepted"}
        :{ok:null,reason:errors[0]||"siteverify_unexpected_response"};
    if(health.ok!==null)turnstileSecretHealthCache={checkedAt:now,result:health};
    return health;
  }catch{return {ok:null,reason:"siteverify_unavailable"}}
  finally{clearTimeout(timer)}
}

async function rewriteRegistrationVerificationFailure(response){
  if(response.status!==403)return response;
  const type=String(response.headers.get("content-type")||"").toLowerCase();
  if(!type.includes("application/json"))return response;
  try{
    const data=await response.clone().json();
    if(data?.error!=="human_verification_failed")return response;
    const headers=new Headers(response.headers);headers.set("cache-control","no-store");
    return new Response(JSON.stringify({
      error:"human_verification_retry",
      message:"Human verification was rejected. If this repeats after a fresh challenge, confirm the Turnstile site key and secret key come from the same widget and that thebedesk.com is an allowed hostname.",
      retryable:true
    }),{status:403,statusText:response.statusText,headers});
  }catch{return response}
}

async function fetchWithTurnstileCspRepair(request,env,ctx){
  const agenticResponse=await handleAgenticRequest({
    request,
    logicalPath:logicalRequestPath(request),
    env,
    ctx,
    coreFetch:(innerRequest,innerEnv=env,innerCtx=ctx)=>worker.fetch(innerRequest,innerEnv,innerCtx)
  });
  if(agenticResponse)return agenticResponse;

  if(isRegistrationProofChallengeRequest(request))return createRegistrationProofChallenge(request,env);

  const registrationRequest=isRegistrationRequest(request);
  if(registrationRequest){
    if(env?.__THEBE_REGISTRATION_PROOF_VERIFIED===true){
      return worker.fetch(request,env,ctx);
    }
    let body={};
    try{body=await request.clone().json()}catch{}
    const proof=await verifyRegistrationProof(request,env,body?.turnstileToken);
    if(!proof.ok){
      return jsonResponse({
        error:"registration_protection_failed",
        message:"Registration protection expired or could not be verified. Click Create account again to generate a fresh secure proof.",
        retryable:true
      },403);
    }
    const verifiedEnv=Object.assign({},env,{__THEBE_REGISTRATION_PROOF_VERIFIED:true,APP_ENV:"registration-proof-verified",TURNSTILE_SECRET_KEY:""});
    return worker.fetch(request,verifiedEnv,ctx);
  }

  let response=await worker.fetch(request,env,ctx);
  if(request.method!=="GET")return response;
  const type=String(response.headers.get("content-type")||"").toLowerCase();
  const path=logicalRequestPath(request);
  if(path===WORKSPACE_RUNTIME_ASSET&&(type.includes("javascript")||type.includes("ecmascript")||type.includes("text/plain"))){
    const runtime=await response.clone().text();
    const repairedRuntime=injectWorkspaceLazyViewClient(injectFirstPartyRegistrationClient(runtime));
    if(repairedRuntime===runtime)return response;
    const headers=new Headers(response.headers);
    headers.set("x-thebe-registration-protection","first-party-proof-v1");
    return new Response(repairedRuntime,{status:response.status,statusText:response.statusText,headers});
  }
  if(!type.includes("text/html"))return response;
  const html=await response.clone().text();
  const baseHtml=injectFirstPartyRegistrationClient(injectLogoFavicon(stripConflictingMetaCsp(html)));
  const publicSurface=path==="/home"||path==="/home/";
  const workspaceSurface=path==="/"||path==="/app"||path==="/app/";
  const surfaceHtml=workspaceSurface?externalizeWorkspaceViews(externalizeWorkspaceHeadStyles(externalizeWorkspaceRuntime(baseHtml))):baseHtml;
  const repaired=workspaceSurface?injectOwnerCommandCentreAssets(surfaceHtml):publicSurface?injectPublicThebeAssets(surfaceHtml):surfaceHtml;
  if(repaired===html)return response;
  const headers=new Headers(response.headers);
  headers.set("x-thebe-csp-meta","server-header-authoritative");
  headers.set("x-thebe-favicon","optimized-512");
  headers.set("x-thebe-registration-protection","first-party-proof-v1");
  if(workspaceSurface){
    headers.set("x-thebe-owner-brief",OWNER_COMMAND_CENTRE_RELEASE);
    headers.set("x-thebe-executive-personalization",EXECUTIVE_PERSONALIZATION_RELEASE);
    headers.set("x-thebe-business-data-bridge",BUSINESS_DATA_BRIDGE_RELEASE);
  }
  if(workspaceSurface||publicSurface)headers.set("x-thebe-ai-dock",THEBE_AI_DOCK_RELEASE);
  return new Response(repaired,{status:response.status,statusText:response.statusText,headers});
}

export {
  createRegistrationProofChallenge,
  injectFirstPartyRegistrationClient,
  injectLogoFavicon,
  injectOwnerCommandCentreAssets,
  injectPublicThebeAssets,
  externalizeWorkspaceRuntime,
  externalizeWorkspaceHeadStyles,
  externalizeWorkspaceViews,
  injectWorkspaceLazyViewClient,
  isRegistrationRequest,
  isRegistrationProofChallengeRequest,
  rewriteRegistrationVerificationFailure,
  stripConflictingMetaCsp,
  turnstileCspReady,
  turnstileSecretHealth,
  verifyRegistrationProof
};

export default {
  fetch:fetchWithTurnstileCspRepair,
  async scheduled(event,env,ctx){
    return worker.scheduled(event,env,ctx);
  }
};