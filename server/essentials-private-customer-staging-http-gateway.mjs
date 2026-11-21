/**
 * Unmounted source-only private customer HTTP host + accessible quotation UI.
 * No deployed Worker/route/IdP/D1/production customer consent.
 */
const deny=()=>{throw Error("private_customer_staging_gateway_unverified")};
const ID=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const safe=x=>String(x).replace(/&/g,"&amp;").replace(/</g,"&lt;")
 .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const td=new TextDecoder("utf-8",{fatal:true});
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
function trustedAuthorizationUrl(value){
 if(typeof value!=="string"||value.length>4096)deny();
 let url;try{url=new URL(value)}catch{deny()}
 if(url.protocol!=="https:"||!url.hostname||url.username||url.password||
    url.hash||!url.search||!url.searchParams.get("state"))deny();
 return url.href;
}
function trustedCustomerCookie(value,kind){
 if(typeof value!=="string"||value.length>512||/[\r\n]/.test(value))deny();
 const patterns={
  oauth:/^__Host-thebe-customer-oauth=([A-Za-z0-9_-]{43}); Secure; HttpOnly; SameSite=Lax; Path=\/; Max-Age=([1-9][0-9]*)$/,
  customer:/^__Host-thebe-customer=([A-Za-z0-9_-]{43}); Secure; HttpOnly; SameSite=Lax; Path=\/; Max-Age=([1-9][0-9]*)$/,
  csrf:/^__Host-thebe-customer-csrf=([A-Za-z0-9_-]{43}); Secure; SameSite=Strict; Path=\/; Max-Age=([1-9][0-9]*)$/,
  clear:/^__Host-thebe-customer-oauth=; Secure; HttpOnly; SameSite=Lax; Path=\/; Max-Age=0$/
 };
 const match=patterns[kind]?.exec(value);
 if(!match||(kind!=="clear"&&(!TOKEN.test(match[1])||
    !Number.isSafeInteger(Number(match[2]))||Number(match[2])>86400)))deny();
 return value;
}
const css=":root{--blue:#1762bd;--navy:#12263e}*{box-sizing:border-box}body{margin:0;background:#f4f6f9;color:var(--navy);font:16px system-ui,Arial}header{background:#17283c;color:white;padding:20px}main{max-width:900px;margin:24px auto;padding:0 16px 48px}article{background:#fff;border:1px solid #d6e0e9;border-radius:14px;padding:24px;margin:18px 0}h1{font-size:clamp(24px,4vw,34px)}h2{font-size:21px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.6}.muted{color:#5c6876}.amount{font-weight:750;font-size:24px}.choice{display:flex;gap:12px;align-items:flex-start;line-height:1.6}input{min-height:20px;min-width:20px;margin-top:5px}button{font:inherit;font-weight:650;border-radius:10px;min-height:48px;padding:12px 22px;border:1px solid #b5c3d2;background:white;cursor:pointer}button.primary{background:var(--blue);color:white;border-color:var(--blue)}button:disabled{opacity:.5;cursor:not-allowed}.actions{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0}#feedback{min-height:28px;font-weight:600}@media(max-width:560px){article{padding:16px}.actions button{width:100%}}";
const invitationClientScript="(()=>{const status=document.getElementById(\"invite-status\"),button=document.getElementById(\"continue\");const parts=new URLSearchParams(location.hash.startsWith(\"#\")?location.hash.slice(1):\"\");const values=parts.getAll(\"ticket\");const ticket=values.length===1?values[0]:\"\";history.replaceState(null,\"\",location.pathname);if(!/^[A-Za-z0-9_-]{43}$/.test(ticket)){status.textContent=\"This invitation link is incomplete or has expired.\";return;}button.disabled=false;button.addEventListener(\"click\",async()=>{button.disabled=true;status.textContent=\"Opening secure sign-in…\";try{const response=await fetch(location.pathname+\"/start\",{method:\"POST\",credentials:\"same-origin\",redirect:\"error\",cache:\"no-store\",referrerPolicy:\"no-referrer\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({ticket})});if(!response.ok)throw Error(\"invalid ticket\");const result=await response.json();const url=new URL(result.authorizationUrl);if(url.protocol!==\"https:\"||!url.hostname)throw Error(\"unsafe redirect\");location.assign(url.href);}catch{status.textContent=\"Sign-in could not be started. Request a new invitation.\";}})})();";
const clientScript="(()=>{const form=document.getElementById(\"accept-form\"),box=document.getElementById(\"agree\"),button=document.getElementById(\"confirm\"),feedback=document.getElementById(\"feedback\"),reject=document.getElementById(\"decline\"),intent=JSON.parse(document.getElementById(\"intent\").textContent);box.addEventListener(\"change\",()=>{button.disabled=!box.checked});reject.addEventListener(\"click\",()=>{form.hidden=true;feedback.textContent=\"No acceptance recorded.\"});form.addEventListener(\"submit\",async e=>{e.preventDefault();if(!box.checked)return;const cookies=document.cookie.split(\";\").map(x=>x.trim()).filter(x=>x.startsWith(\"__Host-thebe-customer-csrf=\"));if(cookies.length!==1){feedback.textContent=\"Session expired.\";return;}const csrf=cookies[0].slice(\"__Host-thebe-customer-csrf=\".length);if(!/^[A-Za-z0-9_-]{43}$/.test(csrf)){feedback.textContent=\"Session expired.\";return;}button.disabled=true;feedback.textContent=\"Submitting…\";try{const response=await fetch(form.dataset.endpoint,{method:\"POST\",credentials:\"same-origin\",redirect:\"error\",cache:\"no-store\",referrerPolicy:\"no-referrer\",headers:{\"content-type\":\"application/json\",\"x-csrf-token\":csrf},body:JSON.stringify(intent)});if(!response.ok)throw Error(\"denied\");const receipt=await response.json();if(receipt.state!==\"recorded\")throw Error(\"denied\");form.hidden=true;feedback.textContent=\"Acceptance recorded. Reference: \"+receipt.quotationId;}catch{feedback.textContent=\"Acceptance not confirmed. Check your status before retrying.\";}})})();";
function visibleText(x,max){
 const raw=x instanceof Uint8Array?x:x instanceof ArrayBuffer?
  new Uint8Array(x):Array.isArray(x)?Uint8Array.from(x):null;
 if(!raw||raw.length<1||raw.length>max)deny();
 let v;try{v=td.decode(raw)}catch{deny()}
 if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v))deny();
 return v;
}
const noStore=(extra={})=>({
 "cache-control":"private, no-store, max-age=0",
 "pragma":"no-cache","expires":"0",
 "referrer-policy":"no-referrer","x-content-type-options":"nosniff",
 "x-frame-options":"DENY","cross-origin-resource-policy":"same-origin",
 "permissions-policy":"camera=(), microphone=(), geolocation=()",
 ...extra
});
export function renderCustomerInvitation({invitationId,nonce}={}){
 if(!ID(invitationId)||typeof nonce!=="string"||
  !/^[A-Za-z0-9_-]{16,128}$/.test(nonce))deny();
 const html=[
  "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">",
  "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
  "<meta name=\"robots\" content=\"noindex,nofollow,noarchive\">",
  "<title>Private customer invitation | Thebe Desk</title>",
  "<style>",css,"</style></head><body>",
  "<header><strong>Thebe Desk</strong> · Secure customer invitation</header>",
  "<main><h1>Verify your identity</h1><article>",
  "<h2>Continue to secure sign-in</h2>",
  "<p>This invitation is for the intended customer only. ",
  "You will be asked to sign in before reviewing your quotation and all terms.</p>",
  "<p class=\"muted\">Invitation reference: ",safe(invitationId),"</p>",
  "<button id=\"continue\" class=\"primary\" type=\"button\" disabled>",
  "Continue to identity verification</button>",
  "<p id=\"invite-status\" role=\"status\" aria-live=\"polite\"></p>",
  "<p class=\"muted\">A forwarded link does not establish customer ownership. ",
  "Only an independently verified customer account can proceed.</p>",
  "</article></main>",
  "<script nonce=\"",nonce,"\">",invitationClientScript,
  "</script></body></html>"
 ].join("");
 return Object.freeze({html,headers:noStore({
  "content-type":"text/html; charset=utf-8",
  "content-security-policy":"default-src 'none'; base-uri 'none'; "+
   "object-src 'none'; frame-ancestors 'none'; form-action 'self'; "+
   "connect-src 'self'; style-src 'unsafe-inline'; "+
   "script-src 'nonce-"+nonce+"'; upgrade-insecure-requests"
 })});
}
export function renderCustomerQuotation({review,nonce}={}){
 if(!review||!ID(review.quotationId)||!ID(review.quotationReference)||
   !ID(review.presentationId)||!/^[A-Za-z0-9_-]{16,128}$/.test(nonce||"")||
   !/^[a-f0-9]{64}$/.test(review.quotationSha256)||
   !/^[a-f0-9]{64}$/.test(review.termsSha256)||
   !Number.isSafeInteger(review.acceptanceVersion)||
   !Number.isSafeInteger(review.totalMinor)||review.totalMinor<0)deny();
 const quote=safe(visibleText(review.immutableQuotationBytes,131072));
 const terms=safe(visibleText(review.immutableTermsBytes,65536));
 const total=(review.totalMinor/100).toLocaleString("en-BW",{
  minimumFractionDigits:2,maximumFractionDigits:2
 });
 const intent=JSON.stringify({
  presentationId:review.presentationId,acceptanceVersion:review.acceptanceVersion,
  confirmedQuotationSha256:review.quotationSha256,
  confirmedTermsSha256:review.termsSha256,
  confirmedTotalMinor:review.totalMinor,decision:"accept",explicitlyAccepted:true
 }).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026")
  .replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
 const endpoint="/private/customer/quotations/"+encodeURIComponent(review.quotationId)+"/accept";
 const html=[
  "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">",
  "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
  "<meta name=\"robots\" content=\"noindex,nofollow,noarchive\">",
  "<title>Review quotation ",safe(review.quotationReference),
  " | Thebe Desk</title><style>",css,"</style></head><body>",
  "<header><strong>Thebe Desk</strong> · Secure customer quotation</header>",
  "<main><h1>Review your quotation</h1><p class=\"muted\">Reference: ",
  safe(review.quotationReference),"</p>",
  "<article><h2>Quotation details</h2><p class=\"amount\">BWP ",
  safe(total),"</p><p class=\"muted\">Version ",
  String(review.acceptanceVersion),"</p><pre>",quote,"</pre></article>",
  "<article><h2>Full contractual terms</h2><p>Read every term carefully.</p><pre>",
  terms,"</pre></article>",
  "<article><form id=\"accept-form\" data-endpoint=\"",safe(endpoint),"\">",
  "<h2>Your decision</h2><label class=\"choice\">",
  "<input id=\"agree\" type=\"checkbox\" required>",
  "<span>I reviewed the quotation, complete terms and BWP amount, ",
  "and explicitly agree to accept this version.</span></label>",
  "<div class=\"actions\"><button class=\"primary\" id=\"confirm\" disabled ",
  "type=\"submit\">Accept quotation</button>",
  "<button id=\"decline\" type=\"button\">Do not accept</button></div></form>",
  "<p id=\"feedback\" role=\"status\" aria-live=\"polite\"></p></article>",
  "<p class=\"muted\">Viewing or declining does not record acceptance.</p></main>",
  "<script type=\"application/json\" id=\"intent\" nonce=\"",nonce,"\">",
  intent,"</script><script nonce=\"",nonce,"\">",clientScript,
  "</script></body></html>"
 ].join("");
 return Object.freeze({html,headers:noStore({
  "content-type":"text/html; charset=utf-8",
  "content-security-policy":"default-src 'none'; base-uri 'none'; "+
   "object-src 'none'; frame-ancestors 'none'; form-action 'self'; "+
   "connect-src 'self'; style-src 'unsafe-inline'; "+
   "script-src 'nonce-"+nonce+"'; upgrade-insecure-requests"
 })});
}
export function createEssentialsPrivateCustomerStagingHttpGateway({
 enabled=false,environment,expectedOrigin,
 journey,customerReviewBoundary,consentCommitter,
 authorizeProtectedHostRequest,enforceCustomerRateLimit,makeCspNonce
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("private_customer_staging_gateway_disabled");
 let origin;try{origin=new URL(expectedOrigin)}catch{
  throw Error("private_customer_staging_gateway_unconfigured")
 }
 if(origin.protocol!=="https:"||expectedOrigin!==origin.origin||
   [journey?.beginCustomerLogin,journey?.completeCustomerLogin,
    customerReviewBoundary?.prepareCustomerReview,
    consentCommitter?.commitExplicitCustomerAcceptance,
    authorizeProtectedHostRequest,enforceCustomerRateLimit,
    makeCspNonce].some(fn=>typeof fn!=="function"))
  throw Error("private_customer_staging_gateway_unconfigured");
 return Object.freeze({
  async handleRequest(request){
   if(typeof request?.headers?.get!=="function")deny();
   let url;try{url=new URL(request.url)}catch{deny()}
   if(url.origin!==expectedOrigin)deny();
   const path=url.pathname,method=request.method;
   let kind="unknown",quotationId=null,invitationId=null;
   const entry=path.match(/^\/private\/customer\/invitations\/([A-Za-z0-9_-]{1,100})$/);
   const inv=path.match(/^\/private\/customer\/invitations\/([A-Za-z0-9_-]{1,100})\/start$/);
   const quote=path.match(/^\/private\/customer\/quotations\/([A-Za-z0-9_-]{1,100})\/(review|accept)$/);
   if(entry&&method==="GET"&&!url.search){kind="invite-entry";invitationId=entry[1]}
   else if(inv&&method==="POST"){kind="start";invitationId=inv[1]}
   else if(path==="/private/customer/oidc/callback"&&method==="GET")
    kind="callback";
   else if(quote&&((method==="GET"&&quote[2]==="review")||
                   (method==="POST"&&quote[2]==="accept"))){
    kind=quote[2];quotationId=quote[1];
   }else return new Response("Not Found",{status:404,headers:noStore()});
   let allowed=false,withinLimit=false;
   try{
    [allowed,withinLimit]=await Promise.all([
     authorizeProtectedHostRequest({request,kind,quotationId,invitationId}),
     enforceCustomerRateLimit({request,kind,quotationId,invitationId})
    ]);
   }catch{deny()}
   if(allowed!==true||withinLimit!==true)
    return new Response("Unavailable",{status:403,headers:noStore()});
   try{
    if(kind==="invite-entry"){
     const nonce=await makeCspNonce({request,invitationId});
     const page=renderCustomerInvitation({invitationId,nonce});
     return new Response(page.html,{status:200,headers:page.headers});
    }
    if(kind==="start"){
     const a=await journey.beginCustomerLogin({request,invitationId});
     const h=new Headers(noStore({
      "content-type":"application/json; charset=utf-8"
     }));
     const authorizationUrl=trustedAuthorizationUrl(a?.authorizationUrl);
     h.append("set-cookie",trustedCustomerCookie(a?.setCookie,"oauth"));
     return new Response(JSON.stringify({
      authorizationUrl
     }),{status:200,headers:h});
    }
    if(kind==="callback"){
     const r=await journey.completeCustomerLogin({request});
     if(!ID(r.quotationId))deny();
     const h=new Headers(noStore({location:"/private/customer/quotations/"+
      encodeURIComponent(r.quotationId)+"/review"}));
     h.append("set-cookie",trustedCustomerCookie(r.customerSetCookie,"customer"));
     h.append("set-cookie",trustedCustomerCookie(r.csrfSetCookie,"csrf"));
     h.append("set-cookie",trustedCustomerCookie(r.oauthClearCookie,"clear"));
     return new Response(null,{status:303,headers:h});
    }
    if(kind==="review"){
     const r=await customerReviewBoundary.prepareCustomerReview({
      request,quotationId
     });
     const nonce=await makeCspNonce({request,quotationId});
     const p=renderCustomerQuotation({review:r,nonce});
     return new Response(p.html,{status:200,headers:p.headers});
    }
    const a=await consentCommitter.commitExplicitCustomerAcceptance({
     request,quotationId
    });
    if(a?.state!=="recorded"||a.quotationId!==quotationId)deny();
    return new Response(JSON.stringify({
     state:"recorded",quotationId:a.quotationId,
     acceptedAtMs:a.acceptedAtMs,acceptanceSha256:a.acceptanceSha256
    }),{status:200,headers:noStore({
     "content-type":"application/json; charset=utf-8"
    })});
   }catch{
    return new Response("Request could not be completed",{
     status:403,headers:noStore()
    });
   }
  }
 });
}
