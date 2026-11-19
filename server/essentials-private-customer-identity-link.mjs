/**
 * UNMOUNTED SOURCE-ONLY trusted customer identity link resolver.
 * A real IdP login and independently verified customer ownership must have
 * been established by the private host. This read-only resolver does not
 * authorize onboarding, identity linking, consent issuance or D1 execution.
 * No production Finance, customer, Worker or Cloudflare connections here.
 */
const ID=value=>typeof value==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const SUBJECT=value=>typeof value==="string"&&value.length>=1&&value.length<=160&&
 /^[A-Za-z0-9._:@|-]+$/.test(value);
const HASH=value=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
const reject=()=>{throw Error("private_customer_identity_link_unverified")};
const encoder=new TextEncoder();
export const ESSENTIALS_PRIVATE_CUSTOMER_IDENTITY_LINK_SQL=[
 "SELECT link_id,tenant_id,customer_id,consent_subject_id,",
 " provisioned_by_actor_user_id,proof_reference_sha256,expires_at_ms,state",
 " FROM essentials_private_customer_identity_links",
 " WHERE issuer=? AND subject_hmac_sha256=? AND tenant_id=? AND customer_id=?",
 " AND state='active' AND expires_at_ms>? LIMIT 1"
].join(" ");
function verifyIssuer(value) {
 if(typeof value!=="string"||value.length>250) return false;
 try{
  const u=new URL(value);
  return u.protocol==="https:"&&!u.username&&!u.password&&
    !u.search&&!u.hash&&(u.href===value||u.origin===value);
 }catch{return false}
}
export function createEssentialsPrivateCustomerIdentityLinkResolver({
 enabled=false,environment,db,issuer,subjectTagKey,
 cryptoSubtle=globalThis.crypto?.subtle,now=()=>Date.now(),
 verifyCurrentCustomerOwnership
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("private_customer_identity_link_disabled");
 if(!verifyIssuer(issuer)||typeof db?.prepare!=="function"||
    subjectTagKey?.type!=="secret"||
    subjectTagKey?.extractable!==false||
    subjectTagKey.algorithm?.name!=="HMAC"||
    subjectTagKey.algorithm?.hash?.name!=="SHA-256"||
    !subjectTagKey.usages?.includes("sign")||
    typeof cryptoSubtle?.sign!=="function"||
    typeof now!=="function"||
    typeof verifyCurrentCustomerOwnership!=="function")
  throw Error("private_customer_identity_link_unconfigured");
 return Object.freeze({
  async resolveCustomerAccountLink({
   issuer:requestedIssuer,subject,tenantId,customerId,quotationId
  }={}){
   if(requestedIssuer!==issuer||!SUBJECT(subject)||!ID(tenantId)||
      !ID(customerId)||!ID(quotationId))reject();
   let signed;
   try{
    signed=new Uint8Array(await cryptoSubtle.sign("HMAC",subjectTagKey,
      encoder.encode(JSON.stringify([issuer,subject]))));
   }catch{reject()}
   if(signed.byteLength!==32)reject();
   const tag=Array.from(signed,v=>v.toString(16).padStart(2,"0")).join("");
   const at=now();
   if(!Number.isSafeInteger(at)||at<=0)reject();
   let row;
   try{
    row=await db.prepare(ESSENTIALS_PRIVATE_CUSTOMER_IDENTITY_LINK_SQL)
      .bind(issuer,tag,tenantId,customerId,at).first();
   }catch{reject()}
   if(!row||row.tenant_id!==tenantId||row.customer_id!==customerId||
      row.state!=="active"||!ID(row.link_id)||
      !ID(row.consent_subject_id)||!ID(row.provisioned_by_actor_user_id)||
      !HASH(row.proof_reference_sha256)||
      !Number.isSafeInteger(row.expires_at_ms)||row.expires_at_ms<=at)reject();
   // Authoritative Finance/customer ownership is a host responsibility.
   // A matching row only proves an administratively recorded association.
   let current=false;
   try{
    current=await verifyCurrentCustomerOwnership({
      tenantId,customerId,quotationId,linkId:row.link_id,
      consentSubjectId:row.consent_subject_id,
      provisioningActorUserId:row.provisioned_by_actor_user_id,
      proofReferenceSha256:row.proof_reference_sha256
    });
   }catch{reject()}
   if(current!==true)reject();
   return Object.freeze({linked:true,consentSubjectId:row.consent_subject_id,
     customerIdentityLinkId:row.link_id,identitySubjectHmacSha256:tag});
  }
 });
}
