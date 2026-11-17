export async function quotationBrowserPreview(request,env,fetchSession){
  const path=new URL(request.url).pathname;
  if(path!=="/app/quotations/preview/"&&path!=="/app/quotations/preview")return null;
  const tenant=String(env?.THEBE_QUOTATION_PREVIEW_TENANT_ID||"").trim();
  const headers={"cache-control":"no-store","x-robots-tag":"noindex, nofollow",
    "x-content-type-options":"nosniff","referrer-policy":"no-referrer","x-frame-options":"DENY"};
  const unavailable=()=>new Response("Not found",{status:404,headers});
  if(request.method!=="GET"||!tenant)return unavailable();

  const sessionUrl=new URL("/__thebe_api/auth/me",request.url);
  const session=await fetchSession(new Request(sessionUrl,{headers:request.headers}));
  if(!session.ok)return unavailable();
  const identity=await session.json().catch(()=>null);
  const {user,landingPath}=identity||{};
  if(!user?.id||user.tenantId!==tenant||user.onboardingComplete!==true||landingPath||
    user.role!=="owner")return unavailable();

  const nonce=crypto.randomUUID();
  headers["content-type"]="text/html; charset=utf-8";
  headers["content-security-policy"]="default-src 'none'; script-src 'self' 'nonce-"+nonce+
    "'; style-src 'unsafe-inline'; img-src blob:; base-uri 'none'; frame-ancestors 'none'";
  const html='<!doctype html><html lang="en"><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width, initial-scale=1">'+
    '<title>Quotation preview | Thebe Desk</title><main id="quotation-preview"></main>'+
    '<script type="module" nonce="'+nonce+'">'+
    'import {mountQuotationCustomizablePage} from "/js/quotation-customizable-page.mjs";'+
    'const preview=mountQuotationCustomizablePage(document.getElementById("quotation-preview"),'+
    '{capability:{enabled:true,authenticated:true,canEditQuotations:true,canCustomizeQuotationPreview:true}});'+
    'addEventListener("pagehide",()=>preview.destroy(),{once:true});'+
    'addEventListener("pageshow",event=>{if(event.persisted)location.reload()});</script></html>';
  return new Response(html,{headers});
}

