/**
 * SOURCE-ONLY, UNMOUNTED, isolated-private-staging customer quotation review
 * and explicit-acceptance HTTP boundary candidate.
 *
 * This uses only __Host-thebe-customer. It NEVER treats a Thebe employee
 * session, login, OIDC ID token, forwarded invitation or page GET as consent.
 * It DOES NOT commit consent, execute SQL, mount routes or deploy anything.
 */
const deny=()=>{throw Error("private_customer_quote_acceptance_unverified")};
const ID=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const HASH=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const TOKEN=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{43}$/.test(x);
const te=new TextEncoder(),COOKIE="__Host-thebe-customer";
const MAX_QUOTE_BYTES=131072,MAX_TERMS_BYTES=65536,MAX_POST_BYTES=2048;
const MAX_PRESENTATION_MS=5*60_000;
const ACCEPT_KEYS=[
 "acceptanceVersion","confirmedQuotationSha256","confirmedTermsSha256",
 "confirmedTotalMinor","decision","explicitlyAccepted","presentationId"
].sort();
function clock(now){
 let value;try{value=now()}catch{deny()}
 if(!Number.isSafeInteger(value)||value<=0)deny();
 return value;
}
function cookieValue(header){
 if(typeof header!=="string"||header.length>4096)deny();
 let values=[];
 for(const part of header.split(";")){
  const index=part.indexOf("=");
  if(index>=0&&part.slice(0,index).trim()===COOKIE)
   values.push(part.slice(index+1).trim());
 }
 if(values.length!==1||!TOKEN(values[0]))deny();
 return values[0];
}
function strictUrl(url,origin,quotationId,suffix){
 if(typeof url!=="string"||url.length>2048)deny();
 let parsed;try{parsed=new URL(url)}catch{deny()}
 if(parsed.origin!==origin||parsed.protocol!=="https:"||
    parsed.username||parsed.password||parsed.search||parsed.hash||
    parsed.pathname!=="/private/customer/quotations/"+quotationId+"/"+suffix)deny();
}
function hexEqual(a,b){
 if(!HASH(a)||!HASH(b))return false;
 let diff=0;for(let i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}
async function sha(subtle,bytes){
 let hash;try{hash=new Uint8Array(await subtle.digest("SHA-256",bytes))}
 catch{deny()}
 if(hash.length!==32)deny();
 return [...hash].map(n=>n.toString(16).padStart(2,"0")).join("");
}
async function customerSession(request,quotationId,origin,subtle,load,now){
 if(typeof request?.headers?.get!=="function")deny();
 const sessionKeyHash=await sha(subtle,te.encode(
   cookieValue(request.headers.get("cookie"))));
 let active;try{active=await load({sessionKeyHash})}catch{deny()}
 const at=clock(now);
 if(!active||active.role!=="customer"||active.state!=="active"||
    ![active.tenantId,active.customerId,active.quotationId,
      active.invitationId,active.customerIdentityLinkId].every(ID)||
    active.quotationId!==quotationId||
    !HASH(active.csrfSha256)||
    !Number.isSafeInteger(active.expiresAtMs)||
    active.expiresAtMs<=at)deny();
 return {sessionKeyHash,active,at};
}
function frozenBytes(raw,max){
 if(!(raw instanceof Uint8Array)||raw.length<1||raw.length>max)deny();
 return new Uint8Array(raw);
}
async function verifiedQuote(active,load,subtle){
 let q;try{q=await load({
  tenantId:active.tenantId,customerId:active.customerId,
  quotationId:active.quotationId
 })}catch{deny()}
 if(!q||q.state!=="accepted"||q.tenantId!==active.tenantId||
    q.customerId!==active.customerId||
    q.quotationId!==active.quotationId||
    !ID(q.quotationReference)||!HASH(q.quotationSha256)||
    !HASH(q.termsSha256)||!Number.isSafeInteger(q.acceptanceVersion)||
    q.acceptanceVersion<1||
    !Number.isSafeInteger(q.totalMinor)||q.totalMinor<0)deny();
 const quote=frozenBytes(q.immutableQuotationBytes,MAX_QUOTE_BYTES);
 const terms=frozenBytes(q.immutableTermsBytes,MAX_TERMS_BYTES);
 if(!hexEqual(await sha(subtle,quote),q.quotationSha256)||
    !hexEqual(await sha(subtle,terms),q.termsSha256))deny();
 return {q,quote,terms};
}
async function boundedBody(request){
 const declared=request.headers.get("content-length");
 if(declared!==null&&(!/^[0-9]+$/.test(declared)||
   Number(declared)>MAX_POST_BYTES))deny();
 const reader=request.body?.getReader?.();
 if(!reader)deny();
 let chunks=[],size=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))deny();
   size+=value.length;
   if(size>MAX_POST_BYTES)deny();
   chunks.push(value);
  }
 }catch{
  try{await reader.cancel()}catch{}
  deny();
 }finally{try{reader.releaseLock()}catch{}}
 if(size<2)deny();
 const all=new Uint8Array(size);
 let position=0;
 for(const chunk of chunks){all.set(chunk,position);position+=chunk.length}
 return all;
}
function getOrigin(value){
 if(typeof value!=="string")deny();
 let u;try{u=new URL(value)}catch{deny()}
 if(u.protocol!=="https:"||u.origin!==value||u.username||
    u.password||u.search||u.hash||u.pathname!=="/")deny();
 return u.origin;
}
export function createEssentialsPrivateCustomerQuotationReviewBoundary({
 enabled=false,environment,expectedOrigin,
 cryptoSubtle=globalThis.crypto?.subtle,now=()=>Date.now(),
 loadActiveCustomerSession,loadFrozenCustomerQuote,
 recordCustomerReviewOffered,loadCustomerReviewOffered,
 authorizeCustomerAcceptancePost
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("private_customer_quote_acceptance_disabled");
 let origin;try{origin=getOrigin(expectedOrigin)}
 catch{throw Error("private_customer_quote_acceptance_unconfigured")}
 if(typeof cryptoSubtle?.digest!=="function"||
    [now,loadActiveCustomerSession,loadFrozenCustomerQuote,
     recordCustomerReviewOffered,loadCustomerReviewOffered,
     authorizeCustomerAcceptancePost].some(f=>typeof f!=="function"))
  throw Error("private_customer_quote_acceptance_unconfigured");

 return Object.freeze({
  // Only a protected private customer-only HTTPS GET host may call this.
  // A GET offers the real full quote/terms; it is NOT proof that it was read.
  async prepareCustomerReview({request,quotationId}={}){
   if(!ID(quotationId)||request?.method!=="GET")deny();
   strictUrl(request.url,origin,quotationId,"review");
   const {sessionKeyHash,active,at}=await customerSession(
    request,quotationId,origin,cryptoSubtle,loadActiveCustomerSession,now);
   const {q,quote,terms}=await verifiedQuote(
    active,loadFrozenCustomerQuote,cryptoSubtle);
   let proof;
   try{proof=await recordCustomerReviewOffered({
    sessionKeyHash,tenantId:active.tenantId,
    customerId:active.customerId,quotationId,issuedAtMs:at,
    expiresAtMs:Math.min(at+MAX_PRESENTATION_MS,active.expiresAtMs),
    quotationSha256:q.quotationSha256,termsSha256:q.termsSha256,
    acceptanceVersion:q.acceptanceVersion,totalMinor:q.totalMinor
   })}catch{deny()}
   if(!ID(proof?.presentationId)||proof?.state!=="offered"||
      proof.sessionKeyHash!==sessionKeyHash||
      proof.tenantId!==active.tenantId||proof.customerId!==active.customerId||
      proof.quotationId!==quotationId||
      proof.quotationSha256!==q.quotationSha256||
      proof.termsSha256!==q.termsSha256||
      proof.acceptanceVersion!==q.acceptanceVersion||
      proof.totalMinor!==q.totalMinor||
      // The persisted offer must be the *new* presentation produced for this
      // exact review, not an old yet-unexpired offer or a future-dated row.
      proof.issuedAtMs!==at||
      !Number.isSafeInteger(proof.expiresAtMs)||
      proof.expiresAtMs<=at||proof.expiresAtMs>active.expiresAtMs||
      proof.expiresAtMs>at+MAX_PRESENTATION_MS||
      proof.expiresAtMs-proof.issuedAtMs>MAX_PRESENTATION_MS)deny();
   // Sensitive bytes MUST go only to the authenticated customer's
   // private, no-store render response; never to an employee session.
   return Object.freeze({
    presentationId:proof.presentationId,quotationReference:q.quotationReference,
    quotationId,quotationSha256:q.quotationSha256,termsSha256:q.termsSha256,
    acceptanceVersion:q.acceptanceVersion,totalMinor:q.totalMinor,
    immutableQuotationBytes:quote,immutableTermsBytes:terms,
    expiresAtMs:proof.expiresAtMs
   });
  },
  // Only a protected customer-only HTTPS POST host may invoke this.
  // It produces verified request CONTEXT, not a stored or signed consent.
  async validateExplicitCustomerAcceptance({request,quotationId}={}){
   if(!ID(quotationId)||request?.method!=="POST")deny();
   strictUrl(request.url,origin,quotationId,"accept");
   if(request.headers.get("origin")!==origin||
      request.headers.get("sec-fetch-site")!=="same-origin")deny();
   const contentType=request.headers.get("content-type")||"";
   if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType))deny();
   const rawCsrf=request.headers.get("x-csrf-token");
   if(!TOKEN(rawCsrf))deny();
   const {sessionKeyHash,active,at}=await customerSession(
     request,quotationId,origin,cryptoSubtle,loadActiveCustomerSession,now);
   if(!hexEqual(await sha(cryptoSubtle,te.encode(rawCsrf)),
      active.csrfSha256))deny();
   const bytes=await boundedBody(request);
   let payload;
   try{
    payload=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
   }catch{deny()}
   if(!payload||typeof payload!=="object"||Array.isArray(payload)||
      JSON.stringify(Object.keys(payload).sort())!==JSON.stringify(ACCEPT_KEYS)||
      payload.decision!=="accept"||payload.explicitlyAccepted!==true||
      !ID(payload.presentationId)||!HASH(payload.confirmedQuotationSha256)||
      !HASH(payload.confirmedTermsSha256)||
      !Number.isSafeInteger(payload.acceptanceVersion)||
      !Number.isSafeInteger(payload.confirmedTotalMinor))deny();
   const {q}=await verifiedQuote(active,loadFrozenCustomerQuote,cryptoSubtle);
   if(!hexEqual(payload.confirmedQuotationSha256,q.quotationSha256)||
      !hexEqual(payload.confirmedTermsSha256,q.termsSha256)||
      payload.acceptanceVersion!==q.acceptanceVersion||
      payload.confirmedTotalMinor!==q.totalMinor)deny();
   let offered;
   try{offered=await loadCustomerReviewOffered({
    presentationId:payload.presentationId,
    sessionKeyHash,tenantId:active.tenantId,customerId:active.customerId,
    quotationId
   })}catch{deny()}
   if(!offered||offered.state!=="offered"||
      offered.presentationId!==payload.presentationId||
      offered.sessionKeyHash!==sessionKeyHash||
      offered.tenantId!==active.tenantId||
      offered.customerId!==active.customerId||
      offered.quotationId!==quotationId||
      offered.quotationSha256!==q.quotationSha256||
      offered.termsSha256!==q.termsSha256||
      offered.acceptanceVersion!==q.acceptanceVersion||
      offered.totalMinor!==q.totalMinor||
      !Number.isSafeInteger(offered.issuedAtMs)||
      !Number.isSafeInteger(offered.expiresAtMs)||
      offered.issuedAtMs>at||offered.expiresAtMs<=at||
      offered.expiresAtMs-offered.issuedAtMs>MAX_PRESENTATION_MS||
      offered.expiresAtMs>active.expiresAtMs)deny();
   let allowed=false;
   try{allowed=await authorizeCustomerAcceptancePost({
    sessionKeyHash,tenantId:active.tenantId,customerId:active.customerId,
    quotationId,presentationId:offered.presentationId,
    customerIdentityLinkId:active.customerIdentityLinkId,
    decision:"accept",explicitlyAccepted:true
   })}catch{deny()}
   if(allowed!==true)deny();
   return Object.freeze({
    role:"customer",tenantId:active.tenantId,customerId:active.customerId,
    quotationId,customerIdentityLinkId:active.customerIdentityLinkId,
    sessionKeyHash,presentationId:offered.presentationId,
    confirmedQuoteSha256:q.quotationSha256,
    confirmedTermsSha256:q.termsSha256,
    confirmedTotalMinor:q.totalMinor,
    confirmedAcceptanceVersion:q.acceptanceVersion,
    decision:"accept",explicitlyAccepted:true
   });
  }
 });
}
