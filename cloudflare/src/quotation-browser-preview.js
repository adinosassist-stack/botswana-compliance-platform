export async function quotationBrowserPreview(request,env,fetchSession){
  const path=new URL(request.url).pathname;
  const customerReady=path==="/app/quotations/customer-ready/"||path==="/app/quotations/customer-ready";
  if(!customerReady&&path!=="/app/quotations/preview/"&&path!=="/app/quotations/preview")return null;
  const tenant=String(env?.THEBE_QUOTATION_PREVIEW_TENANT_ID||"").trim();
  const headers={"cache-control":"no-store","x-robots-tag":"noindex, nofollow",
    "x-content-type-options":"nosniff","referrer-policy":"no-referrer","x-frame-options":"DENY"};
  const unavailable=(reason,sessionStatus)=>{
    console.info("quotation_preview_denied",{reason,sessionStatus});
    return new Response("Not found",{status:404,headers});
  };
  if(request.method!=="GET")return unavailable("method");
  if(!tenant)return unavailable("tenant_binding_missing");
  // A browser quotation document must never succeed anonymously, even when a
  // downstream auth/me adapter is mistakenly stubbed or is temporarily permissive.
  if(!request.headers.get("cookie")?.trim())return unavailable("session_cookie_missing");

  const sessionUrl=new URL("/__thebe_api/auth/me",request.url);
  // This read-only, in-process lookup needs the cookie and any explicit Origin.
  // Fetch metadata describes the outer document navigation, not this lookup.
  const sessionHeaders=new Headers();
  for(const name of ["cookie","origin"]){
    const value=request.headers.get(name);
    if(value!==null)sessionHeaders.set(name,value);
  }
  const session=await fetchSession(new Request(sessionUrl,{headers:sessionHeaders}));
  if(!session.ok)return unavailable("session_response",session.status);
  const identity=await session.json().catch(()=>null);
  const {user,landingPath}=identity||{};
  if(!user?.id)return unavailable("session_identity_missing");
  if(user.tenantId!==tenant)return unavailable("tenant_mismatch");
  if(user.role!=="owner"||landingPath)return unavailable("owner_required");
  if(user.onboardingComplete!==true)return unavailable("onboarding_incomplete");

  const configuredAccount=String(env.THEBE_QUOTATION_PREVIEW_BANK_ACCOUNT??"").trim();
  const bankAccount=/^[0-9]{1,34}$/.test(configuredAccount)?configuredAccount:"";
  const nonce=crypto.randomUUID();
  headers["content-type"]="text/html; charset=utf-8";
  headers["content-security-policy"]="default-src 'none'; script-src 'self' 'nonce-"+nonce+
    "'; style-src 'unsafe-inline'; connect-src 'self'; img-src blob:; base-uri 'none'; frame-ancestors 'none'";
  const commercial=customerReady&&env.QUOTATION_COMMERCIAL_ENABLED==='true';
  const html='<!doctype html><html lang="en"><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width, initial-scale=1">'+
    '<title>'+(customerReady?'Customer quotation':'Quotation preview')+' | Thebe Desk</title><main id="quotation-preview"></main>'+
    '<script type="module" nonce="'+nonce+'">'+
    (commercial?'import {mountQuotationCommercialWorkspace} from "/js/quotation-commercial-workspace.mjs";':'import {mountQuotationCustomizablePage} from "/js/quotation-customizable-page.mjs";')+
    'const preview='+(commercial?'await mountQuotationCommercialWorkspace':'mountQuotationCustomizablePage')+'(document.getElementById("quotation-preview"),'+
    '{issuerName:"Lovely Stones PTY LTD",defaultBankAccount:'+JSON.stringify(bankAccount)+','+
    'documentMode:"'+(customerReady?'customer':'preview')+'",'+
    'capability:{enabled:true,authenticated:true,canEditQuotations:true,canCustomizeQuotationPreview:true,'+
    'canPrepareCustomerQuotation:'+(customerReady?'true':'false')+'}});'+
    'addEventListener("pagehide",()=>preview.destroy(),{once:true});'+
    'addEventListener("pageshow",event=>{if(event.persisted)location.reload()});</script></html>';
  return new Response(html,{headers});
}

