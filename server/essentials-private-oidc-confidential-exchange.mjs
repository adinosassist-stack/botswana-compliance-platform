import {customerOidcEndpointsAllowed} from "./essentials-private-customer-oidc-provider-policy.mjs";
/**
 * UNMOUNTED SOURCE ONLY: confidential OIDC code exchange transport candidate.
 * Call ONLY after a trusted host atomically consumes a session-bound state
 * using the private OIDC PKCE handshake. Never expose as an HTTP endpoint.
 * This returns an UNVERIFIED ID token. The cryptographic RS256 ID-token
 * validator and exact quote/consent checks MUST still run separately.
 */
const deny=()=>{throw Error("private_oidc_exchange_unverified")};
const CODE=x=>typeof x==="string"&&x.length>=8&&x.length<=2048&&/^[A-Za-z0-9._~-]+$/.test(x);
const VERIFIER=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{43}$/.test(x);
const CLIENT=x=>typeof x==="string"&&/^[A-Za-z0-9._~:-]{1,128}$/.test(x);
const MAX_RESPONSE_BYTES=12288;
function httpsUrl(value,{issuer=false}={}){
 if(typeof value!=="string"||value.length>500)deny();
 let u;try{u=new URL(value)}catch{deny()}
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||
    (issuer?(value!==u.origin&&value!==u.href):value!==u.href))deny();
 return u;
}
function canonicalJwt(value){
 if(typeof value!=="string"||value.length<60||value.length>8192)return false;
 const parts=value.split(".");
 return parts.length===3&&parts.every(part=>part.length>0&&/^[A-Za-z0-9_-]+$/.test(part));
}
async function boundedJson(response){
 if(response?.status!==200||response?.redirected===true||
    typeof response?.headers?.get!=="function"||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      response.headers.get("content-type")||"")||
    !response.body||typeof response.body.getReader!=="function")deny();
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))deny();
   size+=value.byteLength;
   if(size>MAX_RESPONSE_BYTES)deny();
   chunks.push(value);
  }
 }catch{
  try{await reader.cancel()}catch{}
  deny();
 }finally{
  try{reader.releaseLock()}catch{}
 }
 if(size<2)deny();
 const buf=new Uint8Array(size);let at=0;
 for(const part of chunks){buf.set(part,at);at+=part.length}
 let data;
 try{data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(buf))}
 catch{deny()}finally{buf.fill(0)}
 if(!data||typeof data!=="object"||Array.isArray(data)||
    Object.hasOwn(data,"error")||
    typeof data.token_type!=="string"||
    data.token_type.toLowerCase()!=="bearer"||
    !canonicalJwt(data.id_token))deny();
 return data.id_token;
}
export function createEssentialsPrivateOidcConfidentialExchange({
 enabled=false,environment,providerProfile="same-origin",issuer,clientId,tokenEndpoint,redirectUri,
 getConfidentialClientSecret,fetchToken
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("private_oidc_exchange_disabled");
 try{
  httpsUrl(issuer,{issuer:true});
  httpsUrl(tokenEndpoint);
  httpsUrl(redirectUri);
 }catch{throw Error("private_oidc_exchange_unconfigured")}
 if(!CLIENT(clientId)||!customerOidcEndpointsAllowed({
      providerProfile,issuer,tokenEndpoint
     })||
    typeof getConfidentialClientSecret!=="function"||
    typeof fetchToken!=="function"||typeof Request!=="function")
  throw Error("private_oidc_exchange_unconfigured");

 return Object.freeze({
  // Exactly compatible with #2701 exchangeAuthorizationCode callback.
  async exchangeAuthorizationCode({
    code,codeVerifier,tokenEndpoint:requestedEndpoint,
    clientId:requestedClient,redirectUri:requestedRedirect
  }={}){
   if(!CODE(code)||!VERIFIER(codeVerifier)||
      requestedEndpoint!==tokenEndpoint||
      requestedClient!==clientId||
      requestedRedirect!==redirectUri)deny();
   let clientSecret;
   try{clientSecret=await getConfidentialClientSecret()}
   catch{deny()}
   // The secret is supplied server-side by an approved confidential-client
   // credential authority and must NEVER be copied into a public response.
   if(typeof clientSecret!=="string"||clientSecret.length<16||
      clientSecret.length>1024||/[\x00-\x1f\x7f]/.test(clientSecret))deny();
   let auth;
   try{
    auth="Basic "+btoa(
      encodeURIComponent(clientId)+":"+encodeURIComponent(clientSecret));
   }catch{deny()}
   const body=new URLSearchParams({
    grant_type:"authorization_code",code,
    redirect_uri:redirectUri,code_verifier:codeVerifier
   });
   let request;
   try{
    request=new Request(tokenEndpoint,{
     method:"POST",redirect:"error",cache:"no-store",
     credentials:"omit",referrerPolicy:"no-referrer",
     headers:{
      "authorization":auth,"accept":"application/json",
      "content-type":"application/x-www-form-urlencoded",
      "cache-control":"no-store"
     },body
    });
   }catch{deny()}
   let response;
   try{response=await fetchToken(request)}catch{deny()}
   // A provided transport MUST honor Request.redirect='error', timeout,
   // TLS certificate verification and egress allowlist for the pinned host.
   if(typeof response?.url==="string"&&response.url.length>0&&
      response.url!==tokenEndpoint)deny();
   const idToken=await boundedJson(response);
   return Object.freeze({idToken});
  }
 });
}
