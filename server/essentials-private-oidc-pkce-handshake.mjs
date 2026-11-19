/**
 * UNMOUNTED SOURCE-ONLY isolated-staging OIDC Authorization Code + PKCE S256
 * handshake. Neither an HTTP route nor a production IdP integration.
 *
 * This module never marks a customer as authenticated. An exchanged idToken
 * MUST pass the separately pinned, signature-verifying consent capture module
 * (#2694), matching its original challenge nonce and fresh auth_time.
 * Host callbacks must be implemented by a separately reviewed confidential
 * server-side identity service; this code never accepts browser client secrets.
 */
const denied=()=>{throw Error("private_oidc_handshake_unverified")};
const ID=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const HEX=x=>typeof x==="string"&&/^[0-9a-f]{64}$/.test(x);
const OPAQUE=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{43}$/.test(x);
const CODE=x=>typeof x==="string"&&x.length>=8&&x.length<=2048&&/^[A-Za-z0-9._~-]+$/.test(x);
const encoder=new TextEncoder();
const WINDOW_MS=5*60_000;
function configuredUrl(value,{exactOrigin=false}={}){
 if(typeof value!=="string"||value.length>500)denied();
 let url;try{url=new URL(value)}catch{denied()}
 if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash)denied();
 if(exactOrigin){
  if(value!==url.origin&&value!==url.href)denied();
 }else if(value!==url.href)denied();
 return url;
}
function base64url(bytes){
 let raw="";for(const byte of bytes)raw+=String.fromCharCode(byte);
 return btoa(raw).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
async function hash(subtle,value){
 let result;try{result=new Uint8Array(await subtle.digest("SHA-256",encoder.encode(value)))}
 catch{denied()}
 if(result.byteLength!==32)denied();
 return Array.from(result,b=>b.toString(16).padStart(2,"0")).join("");
}
function clock(now){
 const at=now();
 if(!Number.isSafeInteger(at)||at<=0)denied();
 return at;
}
function freshRandom(randomBytes){
 let bytes;try{bytes=randomBytes(32)}catch{denied()}
 if(!(bytes instanceof Uint8Array)||bytes.byteLength!==32||
    bytes.every(x=>x===0))denied();
 return base64url(bytes);
}
function validChallenge(c,claim,at){
 return c&&c.state==="pending"&&
   c.challengeId===claim.challengeId&&c.tenantId===claim.tenantId&&
   c.actorUserId===claim.actorUserId&&c.quotationId===claim.quotationId&&
   ID(c.customerId)&&OPAQUE(c.nonce)&&
   Number.isSafeInteger(c.expiresAtMs)&&c.expiresAtMs>at;
}
export function createEssentialsPrivateOidcPkceHandshake({
 enabled=false,environment,issuer,clientId,authorizationEndpoint,
 tokenEndpoint,redirectUri,cryptoSubtle=globalThis.crypto?.subtle,
 randomBytes,now=()=>Date.now(),verifyActiveSession,loadBoundChallenge,
 persistAuthorizationAttempt,consumeAuthorizationAttempt,
 exchangeAuthorizationCode
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("private_oidc_handshake_disabled");
 let iss,auth,token,redirect;
 try{
  iss=configuredUrl(issuer,{exactOrigin:true});
  auth=configuredUrl(authorizationEndpoint);
  token=configuredUrl(tokenEndpoint);
  redirect=configuredUrl(redirectUri);
 }catch{throw Error("private_oidc_handshake_unconfigured")}
 if(!clientId||typeof clientId!=="string"||
    !/^[A-Za-z0-9._~:-]{1,128}$/.test(clientId)||
    auth.origin!==iss.origin||token.origin!==iss.origin||
    !redirect.pathname.startsWith("/")||redirect.pathname==="/"||
    typeof cryptoSubtle?.digest!=="function"||
    [randomBytes,now,verifyActiveSession,loadBoundChallenge,
      persistAuthorizationAttempt,consumeAuthorizationAttempt,
      exchangeAuthorizationCode].some(fn=>typeof fn!=="function"))
  throw Error("private_oidc_handshake_unconfigured");
 const issuerValue=issuer;
 async function checkedSession(claim){
  let approved=false;
  try{approved=await verifyActiveSession(claim)}catch{denied()}
  if(approved!==true)denied();
 }
 async function checkedChallenge(claim,at){
  let c;
  try{c=await loadBoundChallenge(claim)}catch{denied()}
  if(!validChallenge(c,claim,at))denied();
  return c;
 }
 return Object.freeze({
  async begin({principal,sessionKeyHash,quotationId,challengeId}={}){
   if(!principal||!ID(principal.tenantId)||!ID(principal.userId)||
      !HEX(sessionKeyHash)||!ID(quotationId)||!ID(challengeId))denied();
   const claim={
    sessionKeyHash,tenantId:principal.tenantId,
    actorUserId:principal.userId,quotationId,challengeId
   };
   const at=clock(now);
   await checkedSession({...claim,operation:"oidc-begin"});
   const c=await checkedChallenge(claim,at);
   const state=freshRandom(randomBytes);
   const verifier=freshRandom(randomBytes);
   if(state===verifier)denied();
   const stateSha256=await hash(cryptoSubtle,state);
   const nonceSha256=await hash(cryptoSubtle,c.nonce);
   const expiresAtMs=Math.min(at+WINDOW_MS,c.expiresAtMs);
   if(expiresAtMs<=at)denied();
   let saved=false;
   try{
    saved=await persistAuthorizationAttempt({
      stateSha256,sessionKeyHash,tenantId:claim.tenantId,
      actorUserId:claim.actorUserId,quotationId,challengeId,
      customerId:c.customerId,nonceSha256,codeVerifier:verifier,
      issuer:issuerValue,clientId,redirectUri,tokenEndpoint,
      issuedAtMs:at,expiresAtMs
    });
   }catch{denied()}
   if(saved!==true)denied();
   const digest=await hash(cryptoSubtle,verifier);
   const codeChallenge=base64url(Uint8Array.from(
    digest.match(/.{2}/g).map(pair=>parseInt(pair,16))
   ));
   const href=new URL(authorizationEndpoint);
   for(const [name,value] of [
    ["response_type","code"],["client_id",clientId],
    ["redirect_uri",redirectUri],["scope","openid"],
    ["code_challenge",codeChallenge],["code_challenge_method","S256"],
    ["state",state],["nonce",c.nonce],
    ["prompt","login"],["max_age","0"]
   ])href.searchParams.set(name,value);
   return Object.freeze({authorizationUrl:href.href,expiresAtMs});
  },
  // Only a private server redirect handler may call this. OIDC redirects
  // are normally cross-site GETs; NEVER require Sec-Fetch-Site=same-origin
  // on this callback. Host separately validates secure same-site session.
  async complete({method,callbackUrl,sessionKeyHash}={}){
   if(method!=="GET"||typeof callbackUrl!=="string"||
      callbackUrl.length>4096||!HEX(sessionKeyHash))denied();
   let url;try{url=new URL(callbackUrl)}catch{denied()}
   if(url.origin!==redirect.origin||url.pathname!==redirect.pathname||
      url.hash||url.username||url.password)denied();
   const keys=[...url.searchParams.keys()];
   if(keys.length!==3||keys.some(k=>!["code","state","iss"].includes(k))||
      ["code","state","iss"].some(k=>url.searchParams.getAll(k).length!==1))
      denied();
   const code=url.searchParams.get("code");
   const state=url.searchParams.get("state");
   if(!CODE(code)||!OPAQUE(state)||
      url.searchParams.get("iss")!==issuerValue)denied();
   const stateSha256=await hash(cryptoSubtle,state);
   const at=clock(now);
   // Host MUST consume the exact state+session atomically. Failure consumes
   // no other user's state, and a consumed state cannot be reissued.
   let attempt;
   try{
    attempt=await consumeAuthorizationAttempt({
      stateSha256,sessionKeyHash,nowMs:at
    });
   }catch{denied()}
   if(!attempt||attempt.state!=="consumed"||
      attempt.stateSha256!==stateSha256||
      attempt.sessionKeyHash!==sessionKeyHash||
      !ID(attempt.tenantId)||!ID(attempt.actorUserId)||
      !ID(attempt.quotationId)||!ID(attempt.challengeId)||
      !ID(attempt.customerId)||!HEX(attempt.nonceSha256)||
      !OPAQUE(attempt.codeVerifier)||
      attempt.issuer!==issuerValue||attempt.clientId!==clientId||
      attempt.redirectUri!==redirectUri||
      attempt.tokenEndpoint!==tokenEndpoint||
      !Number.isSafeInteger(attempt.issuedAtMs)||
      !Number.isSafeInteger(attempt.expiresAtMs)||
      attempt.issuedAtMs>at||attempt.expiresAtMs<=at||
      attempt.expiresAtMs-at>WINDOW_MS)denied();
   const claim={
    sessionKeyHash,tenantId:attempt.tenantId,
    actorUserId:attempt.actorUserId,quotationId:attempt.quotationId,
    challengeId:attempt.challengeId
   };
   await checkedSession({...claim,operation:"oidc-complete"});
   const challenge=await checkedChallenge(claim,at);
   if(challenge.customerId!==attempt.customerId||
      await hash(cryptoSubtle,challenge.nonce)!==attempt.nonceSha256)denied();
   let tokenResponse;
   try{
    tokenResponse=await exchangeAuthorizationCode({
      code,codeVerifier:attempt.codeVerifier,
      tokenEndpoint,clientId,redirectUri,
      // Host must use the separately approved confidential client credentials.
      // Host MUST validate HTTPS transport, response limits and IdP errors.
    });
   }catch{denied()}
   if(!tokenResponse||typeof tokenResponse.idToken!=="string"||
      tokenResponse.idToken.length<60||
      tokenResponse.idToken.length>8192||
      tokenResponse.idToken.split(".").length!==3)denied();
   // IMPORTANT: This idToken is NOT verified here. It is for a trusted
   // internal caller to pass immediately into the pinned OIDC signature,
   // nonce, issuer, auth_time, audience and quote-verifying capture path.
   return Object.freeze({
     idToken:tokenResponse.idToken,
     tenantId:attempt.tenantId,actorUserId:attempt.actorUserId,
     quotationId:attempt.quotationId,challengeId:attempt.challengeId
   });
  }
 });
}
