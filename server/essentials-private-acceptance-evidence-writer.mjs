/**
 * UNMOUNTED private staging candidate for recording verified quotation acceptance.
 * This does not authenticate customer consent, read a quotation system, or mount
 * routes. Trusted host MUST authenticate session/membership/CSRF and independently
 * verify authoritative acceptance evidence (including quote version/totals).
 * Do NOT use with production Finance.
 */
const valid=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const reject=code=>{throw Error(code)};
const validTime=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(x)
 && !Number.isNaN(Date.parse(x)) && new Date(x).toISOString().slice(0,19)===x.slice(0,19);

export function createEssentialsVerifiedAcceptanceWriter({
 enabled=false,environment,db,verifyAuthoritativeAcceptance
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  reject("acceptance_writer_disabled");
 if(typeof db?.prepare!=="function"||typeof verifyAuthoritativeAcceptance!=="function")
  reject("acceptance_writer_unconfigured");
 return Object.freeze({
  async record({principal,quotationId}={}){
   // No browser-submitted tenant/customer/total/approval value is used as truth.
   if(!principal||!valid(principal.tenantId)||!valid(principal.userId)||
      !Array.isArray(principal.permissions)||
      !principal.permissions.includes("quotation:accept:record"))
    reject("permission_denied");
   if(!valid(quotationId))reject("invalid_quotation_id");
   const tenantId=principal.tenantId;
   const evidence=await verifyAuthoritativeAcceptance({
    tenantId,quotationId,actorUserId:principal.userId
   });
   if(!evidence||evidence.verified!==true||
      evidence.tenantId!==tenantId||evidence.quotationId!==quotationId||
      !valid(evidence.customerId)||!valid(evidence.quotationReference)||
      !valid(evidence.acceptedByUserId)||!validTime(evidence.acceptedAt)||
      !Number.isSafeInteger(evidence.acceptanceVersion)||
      evidence.acceptanceVersion<1||evidence.acceptanceVersion>2147483647||
      !Number.isSafeInteger(evidence.totalMinor)||evidence.totalMinor<0)
    reject("acceptance_evidence_unverified");
   // Only the trusted verifier can authorize the acceptance and actor; the
   // authenticated host controls which verifier implementation is injected.
   const stmt=db.prepare(
    "INSERT INTO essentials_accepted_quotation_snapshots (tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,total_minor,accepted_by_user_id,accepted_at,state) VALUES (?,?,?,?,?,?,?,?,'accepted')"
   ).bind(tenantId,quotationId,evidence.customerId,evidence.quotationReference,
    evidence.acceptanceVersion,evidence.totalMinor,evidence.acceptedByUserId,evidence.acceptedAt);
   const result=await stmt.run();
   if(result?.success!==true||result.meta?.changes!==1)reject("acceptance_write_unverified");
   return Object.freeze({tenantId,quotationId,acceptanceVersion:evidence.acceptanceVersion,
    state:"accepted"});
  }
 });
}
