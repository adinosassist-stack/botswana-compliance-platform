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
