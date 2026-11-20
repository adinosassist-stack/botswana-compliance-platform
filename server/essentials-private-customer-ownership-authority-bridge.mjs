/**
 * C4 read-only authoritative customer/quotation ownership bridge.
 *
 * SOURCE ONLY. No Worker route, no service binding, no credentials and no
 * Google OAuth project is created by importing this module.
 *
 * The caller MUST supply a separately provisioned Cloudflare private SERVICE
 * binding to a production-authorized source-of-truth verifier. The verifier
 * NEVER uses global fetch, employee sessions, the staging D1 as authority,
 * a browser-provided email/subject, or production D1 directly.
 *
 * A successful signature only authenticates an upstream attestation; it does
 * not independently prove that the upstream actually queried current Finance
 * and issued-quotation records. That backend needs separate implementation,
 * proof-of-authority tests and owner/independent reviewer approval.
 */

const ENVIRONMENT="essentials-private-staging";
const AUDIENCE="c4-private-customer-quotation-staging";
const URL="https://c4-internal-customer-authority.invalid/v1/ownership/check";
const ID=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const HEX=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const KID=x=>typeof x==="string"&&/^[A-Za-z0-9._-]{1,96}$/.test(x);
const TOKEN=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{43}$/.test(x);
const TE=new TextEncoder();
const TD=new TextDecoder("utf-8",{fatal:true});

function denySetup(){throw Error("c4_customer_authority_unconfigured")}
function trustedIssuer(x){
 if(typeof x!=="string")return false;
 try{const u=new URL(x);return u.protocol==="https:"&&u.origin===x&&
  !u.username&&!u.password&&!u.hash&&!u.search}
 catch{return false}
}
function decode64(segment,max){
 if(typeof segment!=="string"||segment.length<1||segment.length>max||
    !/^[A-Za-z0-9_-]+$/.test(segment)||segment.length%4===1)
  throw Error("invalid_base64");
 const binary=atob(segment.replace(/-/g,"+").replace(/_/g,"/")+
  "=".repeat((4-segment.length%4)%4));
 if(binary.length>max)throw Error("oversize_binary");
 const value=Uint8Array.from(binary,c=>c.charCodeAt(0));
 // Reject noncanonical encodings and alternate bit representations.
 let roundtrip="";
 for(const byte of value)roundtrip+=String.fromCharCode(byte);
 const canon=btoa(roundtrip).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
 if(canon!==segment)throw Error("noncanonical_base64");
 return value;
}
function jsonFromBase64(segment,max){
 const bytes=decode64(segment,max);
 const text=TD.decode(bytes);
 const obj=JSON.parse(text);
 if(!obj||Array.isArray(obj)||typeof obj!=="object")throw Error("invalid_claims");
 return obj;
}
async function boundedRead(response){
 if(!response||response.status!==200||
    !/^application\/jwt(?:\s*;\s*charset=utf-8)?$/i.test(
      response.headers?.get("content-type")||""))
  throw Error("authority_response_untrusted");
 const size=response.headers?.get("content-length");
 if(size!==null&&(!/^\d+$/.test(size)||Number(size)>8192))
  throw Error("authority_oversized");
 const reader=response.body?.getReader?.();
 if(!reader)throw Error("authority_body_missing");
 const chunks=[];let total=0;
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))throw Error("authority_bytes_invalid");
   total+=value.length;
   if(total>8192)throw Error("authority_body_too_large");
   chunks.push(value);
  }
 }catch(e){
  try{await reader.cancel()}catch{}
  throw e;
 }finally{try{reader.releaseLock()}catch{}}
 if(total===0)throw Error("authority_empty");
 const bytes=new Uint8Array(total);let offset=0;
 for(const b of chunks){bytes.set(b,offset);offset+=b.length}
 return TD.decode(bytes);
}
async function verifySignedProof({
 compact,subtle,publicKey,keyId,issuer,nonce,scope,now
}){
 if(typeof compact!=="string"||compact.length>8192) return false;
 const parts=compact.split(".");
 if(parts.length!==3||parts.some(x=>!x))return false;
 let header,claims,signature;
 try{
  header=jsonFromBase64(parts[0],700);
  claims=jsonFromBase64(parts[1],2700);
  signature=decode64(parts[2],900);
 }catch{return false}
 if(Object.keys(header).sort().join(",")!=="alg,kid,typ"||
   header.alg!=="RS256"||header.typ!=="thebe-customer-ownership+jwt"||
   header.kid!==keyId)return false;
 const required=[
  "aud","customer_id","exp","iat","iss","link_id","nonce",
  "ownership","quotation_id","quotation_state","tenant_id"
 ];
 if(Object.keys(claims).sort().join(",")!==required.sort().join(","))return false;
 if(claims.iss!==issuer||claims.aud!==AUDIENCE||
  claims.tenant_id!==scope.tenantId||
  claims.customer_id!==scope.customerId||
  claims.quotation_id!==scope.quotationId||
  claims.link_id!==scope.linkId||
  claims.nonce!==nonce||
  claims.ownership!=="current"||
  claims.quotation_state!=="accepted")return false;
 const nowSec=Math.floor(now/1000);
 if(!Number.isSafeInteger(claims.iat)||!Number.isSafeInteger(claims.exp)||
    claims.iat>nowSec+2||claims.iat<nowSec-15||
    claims.exp<=nowSec||claims.exp-claims.iat>30||
    claims.exp<=claims.iat)return false;
 try{return await subtle.verify(
  "RSASSA-PKCS1-v1_5",publicKey,signature,
  TE.encode(parts[0]+"."+parts[1])
 )===true}
 catch{return false}
}

export function createC4TrustedCustomerOwnershipVerifier({
 enabled=false,environment,issuer,keyId,publicKey,
 sourceBinding,cryptoSubtle=globalThis.crypto?.subtle,
 randomBytes=n=>globalThis.crypto.getRandomValues(new Uint8Array(n)),
 now=()=>Date.now()
}={}){
 if(enabled!==true||environment!==ENVIRONMENT)
  throw Error("c4_customer_authority_disabled");
 if(!trustedIssuer(issuer)||!KID(keyId)||
    publicKey?.type!=="public"||
    publicKey?.algorithm?.name!=="RSASSA-PKCS1-v1_5"||
    publicKey?.algorithm?.hash?.name!=="SHA-256"||
    publicKey?.algorithm?.modulusLength<2048||
    !publicKey.usages?.includes("verify")||
    typeof sourceBinding?.fetch!=="function"||
    typeof cryptoSubtle?.verify!=="function"||
    typeof randomBytes!=="function"||typeof now!=="function")
  denySetup();

 return Object.freeze({
  /**
   * A live issuer/frozen-quote/session module may pass this callback as
   * verifyCurrentCustomerOwnership. Every call performs a NEW private
   * read-only challenge against a real source-of-truth service binding.
   *
   * A response is accepted ONLY for an exact tenant + customer + quotation +
   * independently provisioned identity-link ID and matching random nonce.
   * Throws/network errors/missing source are strictly a denial, not a fallback.
   */
  async verifyCurrentCustomerOwnership({
   tenantId,customerId,quotationId,linkId
  }={}){
   if(![tenantId,customerId,quotationId,linkId].every(ID))return false;
   let nonce;
   try{
    const random=randomBytes(32);
    if(!(random instanceof Uint8Array)||random.length!==32)return false;
    // 256-bit challenge, never from a request header, email or employee cookie.
    nonce=btoa(Array.from(random,x=>String.fromCharCode(x)).join(""))
     .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
   }catch{return false}
   if(!TOKEN(nonce))return false;
   const scope={tenantId,customerId,quotationId,linkId};
   const body=JSON.stringify({
    schema:"thebe-c4-customer-ownership-challenge-v1",
    audience:AUDIENCE,nonce,...scope
   });
   try{
    const request=new Request(URL,{
     method:"POST",redirect:"error",cache:"no-store",credentials:"omit",
     headers:{
      "content-type":"application/json",
      "accept":"application/jwt",
      "cache-control":"no-store"
     },body
    });
    // This invokes ONLY the separately configured Worker service binding.
    // There is deliberately no fallback to global fetch.
    const response=await sourceBinding.fetch(request);
    const jwt=await boundedRead(response);
    return await verifySignedProof({
     compact:jwt,subtle:cryptoSubtle,publicKey,keyId,issuer,nonce,scope,
     now:now()
    });
   }catch{return false}
  }
 });
}

export const C4_CUSTOMER_OWNERSHIP_BRIDGE_CONTRACT=Object.freeze({
 environment:ENVIRONMENT,audience:AUDIENCE,
 bindingName:"CUSTOMER_OWNERSHIP_SOURCE",
 internalServiceUrl:URL,
 usesProductionD1Directly:false,
 usesGlobalFetch:false,
 requiresExternallyApprovedIssuer:true,
 sourceProvisioned:false,
 publicCustomerLoginEnabled:false,
 cloudMutationAuthorized:false
});
