import test from "node:test";
import assert from "node:assert/strict";
import {
 GOOGLE_CUSTOMER_OIDC_ENDPOINTS as google,
 customerOidcEndpointsAllowed as allowed
} from "../server/essentials-private-customer-oidc-provider-policy.mjs";

test("customer OIDC policy keeps historical same-origin configuration",()=>{
 assert.equal(allowed({
  issuer:"https://idp.example.test",
  authorizationEndpoint:"https://idp.example.test/authorize",
  tokenEndpoint:"https://idp.example.test/token"
 }),true);
 assert.equal(allowed({
  issuer:"https://idp.example.test",
  authorizationEndpoint:"https://idp.example.test/authorize",
  tokenEndpoint:"https://different.example.test/token"
 }),false);
 assert.equal(allowed({
  providerProfile:"unknown",
  issuer:"https://idp.example.test",
  authorizationEndpoint:"https://idp.example.test/authorize",
  tokenEndpoint:"https://idp.example.test/token"
 }),false);
});
test("cross-origin Google OIDC is exact, explicit and fail closed",()=>{
 const input={providerProfile:"google-oidc",...google};
 assert.equal(allowed(input),true);
 assert.equal(allowed({issuer:google.issuer,
  authorizationEndpoint:google.authorizationEndpoint,
  tokenEndpoint:google.tokenEndpoint}),false);
 for(const change of [
  {providerProfile:"google"},
  {providerProfile:"production"},
  {issuer:"https://accounts.google.com.attacker.test"},
  {issuer:"https://accounts.google.com/"},
  {authorizationEndpoint:"https://evil.test/authorize"},
  {authorizationEndpoint:google.authorizationEndpoint+"/extra"},
  {authorizationEndpoint:google.authorizationEndpoint+"?next=evil"},
  {tokenEndpoint:"https://oauth2.googleapis.com.attacker.test/token"},
  {tokenEndpoint:"https://oauth2.googleapis.com/token/"},
  {tokenEndpoint:"https://oauth2.googleapis.com/token?redirect=https://evil.test"},
  {tokenEndpoint:"http://oauth2.googleapis.com/token"}
 ]){
  assert.equal(allowed({...input,...change}),false,JSON.stringify(change));
 }
});
test("confidential exchange may omit auth endpoint but never relax Google issuer/token pins",()=>{
 assert.equal(allowed({providerProfile:"google-oidc",
  issuer:google.issuer,tokenEndpoint:google.tokenEndpoint}),true);
 assert.equal(allowed({providerProfile:"google-oidc",
  issuer:google.issuer,tokenEndpoint:"https://oauth2.googleapis.com/token?unexpected=1"}),false);
 assert.equal(allowed({providerProfile:"google-oidc",
  issuer:google.issuer}),false);
});
