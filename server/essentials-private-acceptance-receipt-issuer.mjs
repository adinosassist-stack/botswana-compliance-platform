/**
 * UNMOUNTED synthetic/private-staging candidate only.
 * Prepares and signs a short-lived quotation acceptance receipt only after
 * an independently verified actor, an authoritative frozen quote, and a
 * separately verified, immutable customer-consent record agree.
 *
 * All trusted callbacks are host obligations, NOT implementations here.
 * In particular, a browser-supplied "accepted" flag is NEVER evidence.
 * The private Ed25519 key belongs solely to the isolated consent authority.
 * No route, real consent capture, database migration, Worker, production code
 * path, public key provisioning or customer activation is performed.
 */
const PURPOSE="thebe.essentials.quotation-acceptance.v1";
const ISSUER="thebe-private-quotation-consent-staging";
const FIELDS=["acceptanceVersion","acceptedAt","acceptedByUserId","consentSha256",
 "customerId","expiresAt","issuedAt","issuer","purpose","quotationId",
 "quotationReference","quotationSha256","receiptId","tenantId","totalMinor"];
const TTL_MS=5*60_000;
const id=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const reject=()=>{throw Error("acceptance_issuance_unverified")};
const safeBytes=value=>{
 if(!(value instanceof Uint8Array)||value.byteLength<1||value.byteLength>131072)reject();
 return new Uint8Array(value);
};
const utcMillis=x=>{
 if(typeof x!=="string"||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x))reject();
 const ms=Date.parse(x);
 if(!Number.isFinite(ms)||new Date(ms).toISOString().replace(/\.000Z$/,"Z")!==x.replace(/\.000Z$/,"Z"))reject();
 return ms;
};
function base64url(bytes){
 let chars="";for(const byte of bytes)chars+=String.fromCharCode(byte);
 return btoa(chars).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
async function digest(subtle,bytes){
 let output;
 try{output=await subtle.digest("SHA-256",bytes)}catch{reject()}
 const result=new Uint8Array(output);
 if(result.length!==32)reject();
 return [...result].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export function createEssentialsPrivateAcceptanceReceiptIssuer({
 enabled=false,environment,privateKey,cryptoSubtle=globalThis.crypto?.subtle,
 verifyIssuerAuthorization,loadFrozenAcceptedQuotation,verifyRecordedCustomerConsent,
 commitImmutableReceipt,randomUUID,now=()=>Date.now()
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("acceptance_issuer_disabled");
 if(privateKey?.type!=="private"||privateKey.algorithm?.name!=="Ed25519"||
    !privateKey.usages?.includes("sign")||
    typeof cryptoSubtle?.sign!=="function"||typeof cryptoSubtle?.digest!=="function"||
    typeof verifyIssuerAuthorization!=="function"||
    typeof loadFrozenAcceptedQuotation!=="function"||
    typeof verifyRecordedCustomerConsent!=="function"||
    typeof commitImmutableReceipt!=="function"||
    typeof randomUUID!=="function"||typeof now!=="function")
  throw Error("acceptance_issuer_unconfigured");
 return Object.freeze({
  async issue({principal,quotationId}={}){
   if(!principal||!id(principal.tenantId)||!id(principal.userId)||
      !Array.isArray(principal.permissions)||
      !principal.permissions.includes("quotation:accept:record")||
      !id(quotationId))reject();
   const tenantId=principal.tenantId,actorUserId=principal.userId;
   let authorized=false;
   try{authorized=await verifyIssuerAuthorization({tenantId,quotationId,actorUserId})}
   catch{reject()}
   if(authorized!==true)reject();
   let quote;
   try{quote=await loadFrozenAcceptedQuotation({tenantId,quotationId,actorUserId})}
   catch{reject()}
   if(!quote||quote.state!=="accepted"||quote.tenantId!==tenantId||
      quote.quotationId!==quotationId||
      !id(quote.customerId)||!id(quote.quotationReference)||
      !Number.isSafeInteger(quote.acceptanceVersion)||quote.acceptanceVersion<1||
      quote.acceptanceVersion>2147483647||
      !Number.isSafeInteger(quote.totalMinor)||quote.totalMinor<0)reject();
   const quotationBytes=safeBytes(quote.immutableQuotationBytes);
   const quotationSha256=await digest(cryptoSubtle,quotationBytes);
   let consent;
   try{
    consent=await verifyRecordedCustomerConsent({
     tenantId,quotationId,actorUserId,customerId:quote.customerId,
     quotationReference:quote.quotationReference,
     acceptanceVersion:quote.acceptanceVersion,totalMinor:quote.totalMinor,
     quotationSha256
    });
   }catch{reject()}
   if(!consent||consent.verified!==true||consent.state!=="accepted"||
      consent.tenantId!==tenantId||consent.quotationId!==quotationId||
      consent.actorUserId!==actorUserId||
      consent.customerId!==quote.customerId||
      consent.quotationReference!==quote.quotationReference||
      consent.acceptanceVersion!==quote.acceptanceVersion||
      consent.totalMinor!==quote.totalMinor||
      consent.quotationSha256!==quotationSha256)reject();
   const consentRecordBytes=safeBytes(consent.immutableConsentBytes);
   const consentSha256=await digest(cryptoSubtle,consentRecordBytes);
   const timestamp=now(),acceptedAt=utcMillis(consent.acceptedAt);
   if(!Number.isSafeInteger(timestamp)||timestamp<0||acceptedAt>timestamp)reject();
   const receiptId=randomUUID();
   if(!id(receiptId))reject();
   const issuedAt=new Date(timestamp).toISOString().replace(/\.000Z$/,"Z");
   const expiresAt=new Date(timestamp+TTL_MS).toISOString().replace(/\.000Z$/,"Z");
   const payload=Object.freeze({
    acceptanceVersion:quote.acceptanceVersion,acceptedAt:consent.acceptedAt,
    acceptedByUserId:actorUserId,consentSha256,
    customerId:quote.customerId,expiresAt,issuedAt,issuer:ISSUER,
    purpose:PURPOSE,quotationId,quotationReference:quote.quotationReference,
    quotationSha256,receiptId,tenantId,totalMinor:quote.totalMinor
   });
   const bytes=new TextEncoder().encode(JSON.stringify(
    Object.fromEntries(FIELDS.map(k=>[k,payload[k]]))));
   let signatureBytes;
   try{signatureBytes=new Uint8Array(await cryptoSubtle.sign("Ed25519",privateKey,bytes))}
   catch{reject()}
   if(signatureBytes.byteLength!==64)reject();
   const receipt=Object.freeze({payload,signature:base64url(signatureBytes)});
   // This host-owned commit MUST atomically recheck CURRENT acceptance,
   // its frozen quotation revision and active consent, then durably save the
   // exact receipt. A success from a mock or non-atomic store is not proof.
   let committed=false;
   try{committed=await commitImmutableReceipt({
    tenantId,quotationId,actorUserId,receipt,
    expectedQuotationSha256:quotationSha256,
    expectedConsentSha256:consentSha256
   })}catch{reject()}
   if(committed!==true)reject();
   return receipt;
  }
 });
}
