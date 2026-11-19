/**
 * UNMOUNTED, source-only HTTP/session boundary for isolated Essentials consent.
 * No routes, sessions, D1 bindings or IdP integrations are provisioned here.
 * A trusted host must supply an authoritative server-side session store and
 * session-owned challenge lookup; never accept browser session/tenant claims.
 */
const reject=()=>{throw Error("private_consent_session_unverified")};
const id=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const token=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{43,128}$/.test(x);
const NONCE=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{43}$/.test(x);
const COOKIE="__Host-thebe-consent";
const te=new TextEncoder();
function selectCookie(header){
 if(typeof header!=="string"||header.length>4096)reject();
 const candidates=[];
 for(const part of header.split(";")){
  const p=part.trim(),index=p.indexOf("=");
  if(index===-1)continue;
  if(p.slice(0,index).trim()===COOKIE)candidates.push(p.slice(index+1).trim());
 }
 if(candidates.length!==1||!token(candidates[0]))reject();
 return candidates[0];
}
function equalHex(a,b){
 if(!hex(a)||!hex(b))return false;
 let v=0;for(let i=0;i<64;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);
 return v===0;
}
async function sha256(subtle,value){
 let bytes;
 try{bytes=new Uint8Array(await subtle.digest("SHA-256",te.encode(value)))}
 catch{reject()}
 if(bytes.length!==32)reject();
 return Array.from(bytes,n=>n.toString(16).padStart(2,"0")).join("");
}
export function createEssentialsPrivateConsentRequestBoundary({
 enabled=false,environment,expectedOrigin,
 loadActiveSession,loadSessionChallenge,oneTimeConsentStore,
 cryptoSubtle=globalThis.crypto?.subtle,now=()=>Date.now()
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("private_consent_session_disabled");
 let origin;
 try{
  const u=new URL(expectedOrigin);
  if(u.protocol!=="https:"||u.origin!==expectedOrigin||
     u.username||u.password||u.search||u.hash||u.pathname!=="/")reject();
  origin=u.origin;
 }catch{throw Error("private_consent_session_unconfigured")}
 if(typeof loadActiveSession!=="function"||
    typeof loadSessionChallenge!=="function"||
    typeof oneTimeConsentStore?.loadOneTimeChallenge!=="function"||
    typeof cryptoSubtle?.digest!=="function"||typeof now!=="function")
  throw Error("private_consent_session_unconfigured");

 return Object.freeze({
  // Call once from the trusted request handler for a single POST only.
  // The host must independently enforce request-size, rate limits, TLS,
  // secure cookie issuance, account-link revocation and CSRF token issuance.
  async validateCaptureRequest({request,quotationId,challengeId}={}){
   if(!id(quotationId)||!id(challengeId)||
      request?.method!=="POST"||
      typeof request?.headers?.get!=="function"||
      typeof request?.url!=="string")reject();
   let url;
   try{url=new URL(request.url)}catch{reject()}
   if(url.protocol!=="https:"||url.origin!==origin||
      url.username||url.password||url.search||url.hash)reject();
   if(request.headers.get("origin")!==origin||
      request.headers.get("sec-fetch-site")!=="same-origin")reject();
   const ct=request.headers.get("content-type")||"";
   if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(ct))reject();
   const csrf=request.headers.get("x-csrf-token");
   if(!token(csrf))reject();
   const sessionToken=selectCookie(request.headers.get("cookie"));
   const [sessionKeyHash,csrfHash]=await Promise.all([
    sha256(cryptoSubtle,sessionToken),sha256(cryptoSubtle,csrf)
   ]);
   let session;
   try{session=await loadActiveSession({sessionKeyHash})}
   catch{reject()}
   const at=now();
   if(!Number.isSafeInteger(at)||at<=0||
      !session||session.state!=="active"||
      !id(session.tenantId)||!id(session.actorUserId)||
      !Number.isSafeInteger(session.expiresAtMs)||
      session.expiresAtMs<=at||!equalHex(csrfHash,session.csrfSha256))reject();
   const principal=Object.freeze({
    tenantId:session.tenantId,userId:session.actorUserId
   });
   let bound;
   try{bound=await loadSessionChallenge({
    sessionKeyHash,tenantId:principal.tenantId,
    actorUserId:principal.userId,quotationId,challengeId
   })}catch{reject()}
   if(!bound||bound.state!=="pending"||
      bound.tenantId!==principal.tenantId||
      bound.actorUserId!==principal.userId||
      bound.quotationId!==quotationId||bound.challengeId!==challengeId||
      !id(bound.customerId)||!NONCE(bound.nonce)||
      !Number.isSafeInteger(bound.expiresAtMs)||
      bound.expiresAtMs<=at)reject();
   return Object.freeze({
    principal,
    async verifyHostRequest({challengeId:requested,method,operation}={}){
     return requested===challengeId&&method==="POST"&&
      operation==="accept-frozen-quotation";
    },
    async loadOneTimeChallenge({challengeId:requested}={}){
     if(requested!==challengeId)reject();
     let current;
     try{
      current=await oneTimeConsentStore.loadOneTimeChallenge({
       principal,quotationId,challengeId,nonce:bound.nonce
      });
     }catch{reject()}
     if(!current||current.state!=="pending"||
        current.challengeId!==challengeId||
        current.tenantId!==principal.tenantId||
        current.actorUserId!==principal.userId||
        current.customerId!==bound.customerId||
        current.quotationId!==quotationId||
        current.nonce!==bound.nonce||
        !Number.isSafeInteger(current.expiresAtMs)||
        current.expiresAtMs<bound.expiresAtMs)reject();
     return current;
    }
   });
  }
 });
}
