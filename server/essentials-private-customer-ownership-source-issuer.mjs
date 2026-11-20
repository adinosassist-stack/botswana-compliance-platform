/**
 * C4 source-only INTERNAL customer/quotation ownership proof issuer.
 *
 * This is NOT a public endpoint, live business DB connector or deployment.
 * A genuine production/approved-source adapter MUST supply trusted read-only
 * customer, published-quotation, immutable-terms, identity-link and current
 * independent ownership-check callbacks. No mock, staging-D1-only record,
 * employee session, email, forwarded URL or Google subject proves ownership.
 *
 * Importing this module never creates a route, signing key, DB or cloud action.
 */
const STAGING="essentials-private-staging";
const ENDPOINT="https://c4-internal-customer-authority.invalid/v1/ownership/check";
const AUDIENCE="c4-private-customer-quotation-staging";
const ID=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const HEX=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const KEY_ID=x=>typeof x==="string"&&/^[A-Za-z0-9._-]{1,96}$/.test(x);
const NONCE=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{43}$/.test(x);
const HEADER_KEYS="accept,cache-control,content-type";
const BODY_KEYS="audience,customerId,linkId,nonce,quotationId,schema,tenantId";
const ENCODER=new TextEncoder();
const DECODER=new TextDecoder("utf-8",{fatal:true});
const deny=(status=403)=>new Response("Unavailable",{
 status,headers:{"cache-control":"private, no-store, max-age=0",
 "content-type":"text/plain; charset=utf-8",
 "x-content-type-options":"nosniff","referrer-policy":"no-referrer"}
});
const b64=x=>{
 let result="";
 for(const byte of x)result+=String.fromCharCode(byte);
 return btoa(result).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
};
function noExtra(obj,keys){
 return obj!==null&&!Array.isArray(obj)&&typeof obj==="object"&&
 Object.keys(obj).sort().join(",")===keys;
}
async function readChallenge(request){
 if(request.method!=="POST"||
    request.headers.get("content-type")!=="application/json"||
    request.headers.get("accept")!=="application/jwt"||
    request.headers.get("cache-control")!=="no-store")throw Error("invalid_request");
 const len=request.headers.get("content-length");
 if(len!==null&&(!/^\d+$/.test(len)||Number(len)>1024))
  throw Error("invalid_length");
 const reader=request.body?.getReader?.();
 if(!reader)throw Error("body_missing");
 let size=0,parts=[];
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))throw Error("invalid_bytes");
   size+=value.byteLength;
   if(size>1024)throw Error("oversized_challenge");
   parts.push(value);
  }
 }finally{try{reader.releaseLock()}catch{}}
 if(size<20)throw Error("empty_challenge");
 const bytes=new Uint8Array(size);
 let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
 let obj;try{obj=JSON.parse(DECODER.decode(bytes))}catch{
  throw Error("challenge_json_invalid")
 }
 if(!noExtra(obj,BODY_KEYS)||
    obj.schema!=="thebe-c4-customer-ownership-challenge-v1"||
    obj.audience!==AUDIENCE||
    !NONCE(obj.nonce)||![obj.tenantId,obj.customerId,
    obj.quotationId,obj.linkId].every(ID))throw Error("challenge_scope_invalid");
 return Object.freeze(obj);
}
function issuerOriginValid(value){
 try{const u=new URL(value);
  return u.protocol==="https:"&&u.origin===value&&
   !u.username&&!u.password&&!u.search&&!u.hash}
 catch{return false}
}
function approvedCustomer(r,s){
 return noExtra(r,Object.keys(r||{}).sort().join(","))&&
  r.tenantId===s.tenantId&&r.customerId===s.customerId&&
  r.state==="active"&&r.deleted!==true&&r.revoked!==true;
}
function approvedQuotation(r,s){
 return r&&r.tenantId===s.tenantId&&r.customerId===s.customerId&&
  r.quotationId===s.quotationId&&r.state==="accepted"&&
  r.published===true&&r.revoked===false&&
  Number.isSafeInteger(r.acceptanceVersion)&&r.acceptanceVersion>0&&
  Number.isSafeInteger(r.totalMinor)&&r.totalMinor>=0&&
  HEX(r.quotationSha256)&&HEX(r.termsSha256)&&
  r.immutableQuoteVerified===true&&r.immutableFullTermsVerified===true;
}
function approvedLink(r,s){
 return r&&r.tenantId===s.tenantId&&r.customerId===s.customerId&&
  r.linkId===s.linkId&&r.state==="active"&&
  r.revoked===false&&HEX(r.proofReferenceSha256)&&
  r.provisionedByAuthorizedActor===true;
}
export function createC4CustomerOwnershipSourceIssuer({
 enabled=false,environment,issuer,keyId,signingKey,
 cryptoSubtle=globalThis.crypto?.subtle,now=()=>Date.now(),
 authorizePrivateCaller,rateLimitPrivateCaller,
 readCurrentCustomer,readPublishedQuotationAndTerms,
 readCurrentIdentityLink,verifyIndependentCustomerOwnership
}={}){
 if(enabled!==true||environment!==STAGING)
  throw Error("c4_customer_ownership_issuer_disabled");
 if(!issuerOriginValid(issuer)||!KEY_ID(keyId)||
    signingKey?.type!=="private"||
    signingKey?.extractable!==false||
    signingKey?.algorithm?.name!=="RSASSA-PKCS1-v1_5"||
    signingKey?.algorithm?.hash?.name!=="SHA-256"||
    signingKey?.algorithm?.modulusLength<2048||
    !signingKey.usages?.includes("sign")||
    typeof cryptoSubtle?.sign!=="function"||
    typeof now!=="function"||
    [authorizePrivateCaller,rateLimitPrivateCaller,
     readCurrentCustomer,readPublishedQuotationAndTerms,
     readCurrentIdentityLink,verifyIndependentCustomerOwnership]
      .some(fn=>typeof fn!=="function"))
  throw Error("c4_customer_ownership_issuer_unconfigured");

 return Object.freeze({
  async handleRequest(request){
   let url;try{url=new URL(request?.url)}catch{return deny(404)}
   if(url.href!==ENDPOINT||request?.method!=="POST")return deny(404);
   let challenge;
   try{
    // Independent caller attestation is mandatory: the fact that an HTTP
    // request reached this service is not itself identity or authorization.
    const [allow,withinLimit]=await Promise.all([
     authorizePrivateCaller({request,expectedAudience:AUDIENCE}),
     rateLimitPrivateCaller({request})
    ]);
    if(allow!==true||withinLimit!==true)return deny();
    challenge=await readChallenge(request);
    const s={
     tenantId:challenge.tenantId,customerId:challenge.customerId,
     quotationId:challenge.quotationId,linkId:challenge.linkId
    };
    // Three reads + a separate evidence check are required. No positive
    // fallback or synthetic default; actual adapters must cross-check
    // current authoritative records and revocation on every request.
    const [customer,quotation,link]=await Promise.all([
     readCurrentCustomer({...s}),
     readPublishedQuotationAndTerms({...s}),
     readCurrentIdentityLink({...s})
    ]);
    if(!approvedCustomer(customer,s)||!approvedQuotation(quotation,s)||
       !approvedLink(link,s))return deny();
    const independent=await verifyIndependentCustomerOwnership({
     ...s,customer,quotation,link
    });
    if(independent!==true)return deny();
    const ms=now();
    if(!Number.isSafeInteger(ms)||ms<1000)return deny();
    const issued=Math.floor(ms/1000);
    const claims={
     iss:issuer,aud:AUDIENCE,iat:issued,exp:issued+20,
     nonce:challenge.nonce,tenant_id:s.tenantId,
     customer_id:s.customerId,quotation_id:s.quotationId,
     link_id:s.linkId,ownership:"current",quotation_state:"accepted"
    };
    const header={alg:"RS256",typ:"thebe-customer-ownership+jwt",kid:keyId};
    const segments=[b64(ENCODER.encode(JSON.stringify(header))),
      b64(ENCODER.encode(JSON.stringify(claims)))];
    const input=segments.join(".");
    const sig=new Uint8Array(await cryptoSubtle.sign(
     "RSASSA-PKCS1-v1_5",signingKey,ENCODER.encode(input)));
    if(sig.length<256||sig.length>1024)return deny();
    const jwt=input+"."+b64(sig);
    if(jwt.length>8192)return deny();
    return new Response(jwt,{status:200,headers:{
      "content-type":"application/jwt","cache-control":"private, no-store, max-age=0",
      "x-content-type-options":"nosniff","referrer-policy":"no-referrer"
    }});
   }catch{return deny()}
  }
 });
}
export const C4_CUSTOMER_OWNERSHIP_ISSUER_CONTRACT=Object.freeze({
 environment:STAGING,internalServiceUrl:ENDPOINT,
 bindingName:"CUSTOMER_OWNERSHIP_SOURCE",audience:AUDIENCE,
 defaultEnabled:false,realBusinessReadAdaptersProvided:false,
 separatePrivateCallerAuthorizationRequired:true,
 productionDbDirectBindingAllowed:false,
 cloudMutationAuthorized:false,publicCustomerLoginEnabled:false
});
export default Object.freeze({
 fetch(){return deny(404)}
});
