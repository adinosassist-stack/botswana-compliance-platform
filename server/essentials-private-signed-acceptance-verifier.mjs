/**
 * UNMOUNTED private-staging-only verification contract for quotation acceptance.
 * A dedicated quotation-consent authority must first authenticate the actual
 * customer's consent, freeze the accepted quotation revision/document, and
 * sign the receipt with its OFFLINE/issuer-held Ed25519 PRIVATE key.
 *
 * This verifier receives only the PUBLIC verification key, retrieves the
 * receipt SERVER-SIDE, and requires a fresh independent authority check.
 * A signed receipt alone does not prove the issuer verified customer consent.
 * No sign endpoint, consent service, route, Worker, or production access here.
 */
const PURPOSE="thebe.essentials.quotation-acceptance.v1";
const ISSUER="thebe-private-quotation-consent-staging";
const fields=["acceptanceVersion","acceptedAt","acceptedByUserId","consentSha256",
 "customerId","expiresAt","issuedAt","issuer","purpose","quotationId",
 "quotationReference","quotationSha256","receiptId","tenantId","totalMinor"];
const validId=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const hash=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const reject=()=>{throw Error("acceptance_receipt_unverified")};
const millis=x=>{
 if(typeof x!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x))reject();
 const value=Date.parse(x);
 if(!Number.isFinite(value)||new Date(value).toISOString()!==x.replace(/\.000Z$/,"Z")&&
     new Date(value).toISOString().replace(/\.000Z$/,"Z")!==x)reject();
 return value;
};
function canonicalPayload(p){
 if(!p||typeof p!=="object"||Array.isArray(p)||Object.keys(p).length!==fields.length||
    fields.some(k=>!Object.hasOwn(p,k)))reject();
 return JSON.stringify(Object.fromEntries(fields.map(key=>[key,p[key]])));
}
function signatureBytes(signature){
 if(typeof signature!=="string"||!/^[A-Za-z0-9_-]{86}$/.test(signature))reject();
 let raw;
 try{raw=atob(signature.replace(/-/g,"+").replace(/_/g,"/"))}catch{reject()}
 if(raw.length!==64)reject();
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function verifyShape(p,tenantId,quotationId,actorUserId,now){
 if(p.purpose!==PURPOSE||p.issuer!==ISSUER||
    p.tenantId!==tenantId||p.quotationId!==quotationId||
    p.acceptedByUserId!==actorUserId||
    !validId(p.customerId)||!validId(p.quotationReference)||
    !validId(p.receiptId)||!hash(p.quotationSha256)||!hash(p.consentSha256)||
    !Number.isSafeInteger(p.acceptanceVersion)||p.acceptanceVersion<1||
    p.acceptanceVersion>2147483647||
    !Number.isSafeInteger(p.totalMinor)||p.totalMinor<0)reject();
 const accepted=millis(p.acceptedAt),issued=millis(p.issuedAt),expiry=millis(p.expiresAt);
 if(accepted>issued||issued>now+60_000||expiry<=now||
    expiry<=issued||expiry-issued>10*60_000)reject();
}
export function createEssentialsSignedAcceptanceVerifier({
 enabled=false,environment,publicKey,cryptoSubtle=globalThis.crypto?.subtle,
 loadServerSideReceipt,verifyCurrentAuthorityReceipt,now=()=>Date.now()
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("acceptance_verifier_disabled");
 if(publicKey?.type!=="public"||publicKey.algorithm?.name!=="Ed25519"||
    !publicKey.usages?.includes("verify")||
    typeof cryptoSubtle?.verify!=="function"||
    typeof loadServerSideReceipt!=="function"||
    typeof verifyCurrentAuthorityReceipt!=="function"||
    typeof now!=="function")
  throw Error("acceptance_verifier_unconfigured");
 return async function verifyAuthoritativeAcceptance({tenantId,quotationId,actorUserId}={}){
  if(!validId(tenantId)||!validId(quotationId)||!validId(actorUserId))reject();
  let receipt;
  try{receipt=await loadServerSideReceipt({tenantId,quotationId,actorUserId})}
  catch{reject()}
  if(!receipt||typeof receipt!=="object"||Array.isArray(receipt)||
     Object.keys(receipt).length!==2||
     !Object.hasOwn(receipt,"payload")||!Object.hasOwn(receipt,"signature"))
   reject();
  const serialized=canonicalPayload(receipt.payload);
  const at=now();
  if(!Number.isFinite(at))reject();
  verifyShape(receipt.payload,tenantId,quotationId,actorUserId,at);
  const signature=signatureBytes(receipt.signature);
  let valid=false;
  try{valid=await cryptoSubtle.verify("Ed25519",publicKey,signature,new TextEncoder().encode(serialized))}
  catch{reject()}
  if(valid!==true)reject();
  let current=false;
  try{
   current=await verifyCurrentAuthorityReceipt({
    tenantId,quotationId,actorUserId,
    receiptId:receipt.payload.receiptId,
    acceptanceVersion:receipt.payload.acceptanceVersion,
    customerId:receipt.payload.customerId,
    quotationReference:receipt.payload.quotationReference,
    totalMinor:receipt.payload.totalMinor,
    quotationSha256:receipt.payload.quotationSha256,
    consentSha256:receipt.payload.consentSha256
   });
  }catch{reject()}
  if(current!==true)reject();
  return Object.freeze({
   verified:true,tenantId,quotationId,customerId:receipt.payload.customerId,
   quotationReference:receipt.payload.quotationReference,
   acceptanceVersion:receipt.payload.acceptanceVersion,
   totalMinor:receipt.payload.totalMinor,
   acceptedByUserId:receipt.payload.acceptedByUserId,
   acceptedAt:receipt.payload.acceptedAt
  });
 };
}
