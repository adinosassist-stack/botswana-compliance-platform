import assert from "node:assert/strict";
import test from "node:test";
import {quotationBrowserPreview} from "../cloudflare/src/quotation-browser-preview.js";

const config={THEBE_QUOTATION_PREVIEW_TENANT_ID:"lovely"};
const owner={id:"test-owner",tenantId:"lovely",role:"owner",onboardingComplete:true};
function request(path="/app/quotations/preview/",method="GET"){
  return new Request(new URL(path,"https://example.test"),{method,headers:{cookie:"session=synthetic"}});
}

test("preview skips other routes and requires explicit tenant configuration",async()=>{
  const unused=()=>assert.fail("session should not be queried");
  assert.equal(await quotationBrowserPreview(request("/app/"),config,unused),null);
  assert.equal((await quotationBrowserPreview(request(),{},unused)).status,404);
  assert.equal((await quotationBrowserPreview(request(undefined,"POST"),config,unused)).status,404);
});

test("preview and customer-ready deny cookie-less guests before calling a permissive resolver",async()=>{
 for(const path of ["/app/quotations/preview/","/app/quotations/preview",
                    "/app/quotations/customer-ready/","/app/quotations/customer-ready"]){
  let calls=0;
  const req=new Request(new URL(path,"https://example.test"),{method:"GET"});
  const res=await quotationBrowserPreview(req,config,async()=>{
   calls++;return Response.json({user:owner});
  });
  assert.equal(res.status,404,path);
  assert.equal(res.headers.get("cache-control"),"no-store",path);
  assert.equal(calls,0,path+" must not query downstream session without cookie");
  assert.doesNotMatch(await res.text(),/quotation-customizable-page|canPrepareCustomerQuotation/);
 }
});

test("session cookie alone cannot grant quotation access",async()=>{
 for(const path of ["/app/quotations/preview/","/app/quotations/customer-ready/"]){
  const req=new Request(new URL(path,"https://example.test"),{
   headers:{cookie:"session=synthetic-but-not-authorized"}});
  const res=await quotationBrowserPreview(req,config,async()=>new Response("",{status:401}));
  assert.equal(res.status,404);
 }
});

test("preview mounts the editor for the configured owner without exposing session data",async()=>{
  const navigation=request();
  navigation.headers.set("sec-fetch-site","cross-site");
  navigation.headers.set("sec-fetch-mode","navigate");
  navigation.headers.set("origin","https://example.test");
  const response=await quotationBrowserPreview(navigation,config,async sessionRequest=>{
    assert.equal(sessionRequest.headers.get("sec-fetch-site"),null);
    assert.equal(sessionRequest.headers.get("sec-fetch-mode"),null);
    assert.equal(sessionRequest.headers.get("origin"),"https://example.test");
    assert.equal(new URL(sessionRequest.url).pathname,"/__thebe_api/auth/me");
    assert.equal(sessionRequest.headers.get("cookie"),"session=synthetic");
    return Response.json({user:owner,csrfToken:"private-session-material"});
  });
  assert.equal(response.status,200);
  assert.equal(response.headers.get("cache-control"),"no-store");
  const html=await response.text();
  const nonce=html.match(/nonce="([^"]+)"/)[1];
  assert.ok(response.headers.get("content-security-policy").includes("'nonce-"+nonce+"'"));
  assert.match(html,/quotation-customizable-page\.mjs/);
  assert.doesNotMatch(html,/private-session-material/);
});

test("preview denies unqualified identities and invalid responses",async()=>{
  const responses=[
    Response.json({user:{...owner,tenantId:"other"}}),
    Response.json({user:{...owner,role:"manager"}}),
    Response.json({user:{...owner,onboardingComplete:false}}),
    Response.json({user:owner,landingPath:"/manager-invite/dashboard/"}),
    Response.json(null),
    new Response("",{status:401}),
    new Response("<html>unexpected</html>")
  ];
  for(const session of responses){
    const response=await quotationBrowserPreview(request(),config,async()=>session);
    assert.equal(response.status,404);
  }
});

test("customer-ready route is owner-only, with explicit print capability and no preview-mode downgrade",async()=>{
  const ready=request("/app/quotations/customer-ready/");
  const ownerResponse=await quotationBrowserPreview(ready,config,
    async()=>Response.json({user:owner}));
  assert.equal(ownerResponse.status,200);
  const markup=await ownerResponse.text();
  assert.match(markup,/documentMode:"customer"/);
  assert.match(markup,/canPrepareCustomerQuotation:true/);
  assert.match(markup,/Lovely Stones PTY LTD/);
  assert.doesNotMatch(markup,/private-session-material/);
  const preview=await quotationBrowserPreview(request(),config,
    async()=>Response.json({user:owner}));
  assert.match(await preview.text(),/documentMode:"preview"/);
  const manager=await quotationBrowserPreview(ready,config,
    async()=>Response.json({user:{...owner,role:"manager"}}));
  assert.equal(manager.status,404);
  const foreign=await quotationBrowserPreview(ready,config,
    async()=>Response.json({user:{...owner,tenantId:"elsewhere"}}));
  assert.equal(foreign.status,404);
  assert.equal((await quotationBrowserPreview(ready,{},()=>assert.fail("no session expected"))).status,404);
});
