/**
 * Source-only, default-disabled external-customer OIDC provider endpoint policy.
 * A different HTTPS origin is allowed ONLY for the exact, reviewed Google
 * issuer/authorization/token endpoint triplet. This is not provider selection,
 * registration, a real identity check, or customer-consent activation.
 */
export const GOOGLE_CUSTOMER_OIDC_ENDPOINTS=Object.freeze({
 issuer:"https://accounts.google.com",
 authorizationEndpoint:"https://accounts.google.com/o/oauth2/v2/auth",
 tokenEndpoint:"https://oauth2.googleapis.com/token"
});

export function customerOidcEndpointsAllowed({
 providerProfile="same-origin",issuer,authorizationEndpoint,tokenEndpoint
}={}){
 if(typeof issuer!=="string"||typeof tokenEndpoint!=="string"||
    (authorizationEndpoint!==undefined&&
     typeof authorizationEndpoint!=="string"))return false;
 if(providerProfile==="google-oidc"){
  return issuer===GOOGLE_CUSTOMER_OIDC_ENDPOINTS.issuer&&
   tokenEndpoint===GOOGLE_CUSTOMER_OIDC_ENDPOINTS.tokenEndpoint&&
   (authorizationEndpoint===undefined||
    authorizationEndpoint===GOOGLE_CUSTOMER_OIDC_ENDPOINTS.authorizationEndpoint);
 }
 if(providerProfile!=="same-origin")return false;
 try{
  const iss=new URL(issuer),token=new URL(tokenEndpoint);
  if(iss.protocol!=="https:"||token.protocol!=="https:"||
     iss.origin!==token.origin)return false;
  if(authorizationEndpoint!==undefined){
   const auth=new URL(authorizationEndpoint);
   if(auth.protocol!=="https:"||auth.origin!==iss.origin)return false;
  }
  return true;
 }catch{return false}
}
