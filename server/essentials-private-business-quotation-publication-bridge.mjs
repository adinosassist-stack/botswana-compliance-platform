/**
 * C4 business-authoritative quotation issuance -> existing immutable C4 freeze.
 *
 * SOURCE ONLY: unmounted, not an API endpoint, and NO deployed business-data
 * adapter. An approved owner-only backend must independently provide live
 * tenant/customer/quote records and the isolated C4 freeze store. Never
 * treat the browser quotation preview, editable draft, customer name, email
 * or forwarded invitation as authoritative issuance or customer ownership.
 */
const ID=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const HASH=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const MAX_Q=131072,MAX_TERMS=65536;
const denial=()=>{throw Error("c4_business_quotation_publication_denied")};
function exactBytes(value,max){
 if(!(value instanceof Uint8Array)||value.length<1||value.length>max)denial();
 return new Uint8Array(value);
}
async function digest(subtle,bytes){
 let h;try{h=new Uint8Array(await subtle.digest("SHA-256",bytes))}catch{denial()}
 if(h.length!==32)denial();
 return [...h].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function principalValid(p,tenantId){
 return p?.authenticated===true&&p.sessionVerified===true&&
  p.csrfVerified===true&&p.role==="owner"&&
  p.tenantId===tenantId&&ID(p.userId)&&
  Array.isArray(p.permissions)&&
  p.permissions.includes("quotation:issue:approved");
}
function customerValid(c,tenantId,customerId){
 return c&&c.tenantId===tenantId&&c.customerId===customerId&&
  c.state==="active"&&c.revoked===false&&
  c.deleted===false&&c.authoritativeSource===true;
}
function quoteValid(q,scope){
 return q&&q.tenantId===scope.tenantId&&
  q.customerId===scope.customerId&&q.quotationId===scope.quotationId&&
  ID(q.quotationReference)&&q.state==="approved-for-issuance"&&
  q.current===true&&q.revoked===false&&q.sourceVerified===true&&
  Number.isSafeInteger(q.acceptanceVersion)&&q.acceptanceVersion>=1&&
  q.acceptanceVersion<=2147483647&&
  Number.isSafeInteger(q.totalMinor)&&q.totalMinor>=0&&
  HASH(q.quotationSha256)&&HASH(q.termsSha256)&&
  ID(q.approvalEvidenceId)&&q.completeApprovedTerms===true;
}
export const C4_QUOTATION_PUBLICATION_CONTRACT=Object.freeze({
 environment:"essentials-private-staging",
 customerDbBinding:"CUSTOMER_CONSENT_DB",
 sourceOfTruthAdapterProvisioned:false,
 acceptsBrowserDraftAsSource:false,
 productionDatabaseDirectBindingAllowed:false,
 publicHttpRouteEnabled:false,
 cloudWriteAuthorized:false,
 customerLoginEnabled:false
});
export function createC4AuthoritativeQuotationPublicationBridge({
 enabled=false,environment,cryptoSubtle=globalThis.crypto?.subtle,
 loadActiveBusinessCustomer,loadApprovedBusinessQuotation,
 authorizeBusinessPublication,verifyCurrentApprovalAtFreeze,
 frozenTermsStore
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("c4_business_quotation_publication_disabled");
 if(typeof cryptoSubtle?.digest!=="function"||
    [loadActiveBusinessCustomer,loadApprovedBusinessQuotation,
     authorizeBusinessPublication,verifyCurrentApprovalAtFreeze,
     frozenTermsStore?.freezeQuotationWithTerms].some(f=>typeof f!=="function"))
  throw Error("c4_business_quotation_publication_unconfigured");
 return Object.freeze({
  async publishApprovedQuotation({
   principal,tenantId,customerId,quotationId
  }={}){
   if(![tenantId,customerId,quotationId].every(ID)||
      !principalValid(principal,tenantId))denial();
   const scope=Object.freeze({tenantId,customerId,quotationId});
   let customer,approved,ownerAllowed;
   try{
    // Data *must* originate from independently authorized business stores.
    // No client-supplied quote/terms bytes or mutable preview JSON is used.
    [customer,approved,ownerAllowed]=await Promise.all([
     loadActiveBusinessCustomer({...scope}),
     loadApprovedBusinessQuotation({...scope}),
     authorizeBusinessPublication({
      ...scope,actorUserId:principal.userId,
      permission:"quotation:issue:approved"
     })
    ]);
   }catch{denial()}
   if(ownerAllowed!==true||!customerValid(customer,tenantId,customerId)||
      !quoteValid(approved,scope))denial();
   let quoteBytes,termsBytes;
   try{
    quoteBytes=exactBytes(approved.immutableQuotationBytes,MAX_Q);
    termsBytes=exactBytes(approved.immutableTermsBytes,MAX_TERMS);
   }catch{denial()}
   const [quoteHash,termsHash]=await Promise.all([
    digest(cryptoSubtle,quoteBytes),digest(cryptoSubtle,termsBytes)
   ]);
   if(quoteHash!==approved.quotationSha256||
      termsHash!==approved.termsSha256)denial();
   const source=Object.freeze({
    tenantId,customerId,quotationId,
    quotationReference:approved.quotationReference,
    acceptanceVersion:approved.acceptanceVersion,
    totalMinor:approved.totalMinor,
    frozenByActorUserId:principal.userId,
    immutableQuotationBytes:quoteBytes,
    immutableTermsBytes:termsBytes
   });
   let current;
   try{
    // A second, independent source-of-truth check just before the atomic
    // C4 D1 freeze. The underlying store must ALSO revalidate authority at
    // its own commit boundary; this check alone is not transactional proof.
    current=await verifyCurrentApprovalAtFreeze({
     ...scope,actorUserId:principal.userId,
     approvalEvidenceId:approved.approvalEvidenceId,
     acceptanceVersion:approved.acceptanceVersion,
     totalMinor:approved.totalMinor,
     quotationReference:approved.quotationReference,
     quotationSha256:quoteHash,termsSha256:termsHash
    });
   }catch{denial()}
   if(current!==true)denial();
   let result;
   try{result=await frozenTermsStore.freezeQuotationWithTerms({source})}
   catch{denial()}
   if(result?.state!=="frozen-with-terms"||
     result.tenantId!==tenantId||result.customerId!==customerId||
     result.quotationId!==quotationId||
     result.quotationSha256!==quoteHash||result.termsSha256!==termsHash||
     result.acceptanceVersion!==approved.acceptanceVersion||
     result.totalMinor!==approved.totalMinor)denial();
   return Object.freeze({
    state:"frozen-with-terms",tenantId,customerId,quotationId,
    quotationSha256:quoteHash,termsSha256:termsHash,
    acceptanceVersion:approved.acceptanceVersion,
    totalMinor:approved.totalMinor,
    customerLoginEnabled:false,
    invitationSent:false
   });
  }
 });
}
