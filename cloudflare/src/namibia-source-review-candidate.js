// Source-provenance research candidate only: NOT a regulatory pack or approval path.
// No network requests, regulatory decisions, persistence, or customer activation.
export const NAMIBIA_SOURCE_REVIEW_VERSION="2026-11-07.v1";
export const NAMIBIA_SOURCE_AUTHORITIES=Object.freeze({
  bipa:Object.freeze({label:"BIPA",domains:Object.freeze(["www.bipa.na","bipa.na"])}),
  namra:Object.freeze({label:"NamRA",domains:Object.freeze(["itas.namra.org.na","www.namra.org.na","namra.org.na"])}),
  fic:Object.freeze({label:"FIC",domains:Object.freeze(["www.fic.na","fic.na"])})
});
const sourceIdPattern=/^na_(?:bipa|namra|fic)_[a-z0-9_]{2,70}$/;
const exactDate=(value)=>{
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+"T00:00:00.000Z");
  return !Number.isNaN(date.valueOf())&&date.toISOString().slice(0,10)===value;
};
const validateUrl=(value,authority)=>{
  try{
    const u=new URL(value);
    if(u.protocol!=="https:"||u.username||u.password||u.hash||u.search||u.port)return false;
    return NAMIBIA_SOURCE_AUTHORITIES[authority]?.domains.includes(u.hostname)===true;
  }catch{return false}
};
function fail(error){return Object.freeze({ok:false,error})}
export function prepareNamibiaSourceSnapshotCandidate(input){
  if(!input||typeof input!=="object"||Array.isArray(input))return fail("invalid_source");
  const {sourceId,authority,title,url,capturedAt,contentSha256}=input;
  if(typeof sourceId!=="string"||!sourceIdPattern.test(sourceId))return fail("invalid_source_id");
  if(!Object.hasOwn(NAMIBIA_SOURCE_AUTHORITIES,authority)||!sourceId.startsWith("na_"+authority+"_"))return fail("invalid_authority");
  if(typeof title!=="string"||title.trim()!==title||title.length<5||title.length>160)return fail("invalid_title");
  if(!validateUrl(url,authority))return fail("untrusted_authority_url");
  if(!exactDate(capturedAt))return fail("invalid_snapshot_date");
  if(typeof contentSha256!=="string"||!/^[a-f0-9]{64}$/.test(contentSha256))return fail("content_hash_required");
  // A snapshot is evidence of retrieved text, not an automatically effective legal rule.
  return Object.freeze({ok:true,value:Object.freeze({
    marketCode:"NA",sourceId,authority,title,url,capturedAt,contentSha256,
    status:"unreviewed",verifiedBy:null,verifiedAt:null,effectiveFrom:null,effectiveTo:null,
    legalInterpretationApproved:false,allowAutomatedDeadline:false,
    allowAutomatedFiling:false,allowCustomerRelease:false
  })});
}
export function namibiaSourceReviewReadiness(snapshot){
  if(!snapshot||snapshot.marketCode!=="NA"||snapshot.status!=="unreviewed")return fail("unreviewed_snapshot_required");
  return Object.freeze({ok:true,value:Object.freeze({
    sourceId:snapshot.sourceId,ready:false,blockers:Object.freeze([
      "primary_source_content_review_required","official_effective_dates_unverified",
      "independent_namibian_professional_approval_required",
      "regulatory_pack_integrity_and_release_gate_missing"
    ])
  })});
}
