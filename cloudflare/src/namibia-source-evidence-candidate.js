// Offline source review proofs. No fetch, storage, Worker routes or legal approval.
// Caller supplies downloaded bytes and metadata; the source must be obtained separately.
import {prepareNamibiaSourceSnapshotCandidate} from "./namibia-source-review-candidate.js";
import {draftNamibiaRuleRevision} from "./namibia-rule-review-ledger.js";
export const NAMIBIA_SOURCE_EVIDENCE_VERSION="2026-11-07.v1";
const fail=error=>Object.freeze({ok:false,error});
const validRevision=n=>Number.isSafeInteger(n)&&n>0&&n<100000;
const shaPattern=/^[a-f0-9]{64}$/;
function hex(buffer){return [...new Uint8Array(buffer)].map(n=>n.toString(16).padStart(2,"0")).join("")}
export async function sha256NamibiaSource(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength===0||bytes.byteLength>2_000_000)return fail("source_bytes_required_or_too_large");
 const hash=await crypto.subtle.digest("SHA-256",bytes);
 return Object.freeze({ok:true,sha256:hex(hash),byteLength:bytes.byteLength});
}
export async function createNamibiaSourceEvidenceCandidate({metadata,bytes,revision}={}){
 if(!validRevision(revision))return fail("invalid_revision");
 const snapshot=prepareNamibiaSourceSnapshotCandidate(metadata);
 if(!snapshot.ok)return fail(snapshot.error);
 const digest=await sha256NamibiaSource(bytes);
 if(!digest.ok)return digest;
 if(snapshot.value.contentSha256!==digest.sha256)return fail("content_hash_mismatch");
 return Object.freeze({ok:true,value:Object.freeze({
    marketCode:"NA",sourceId:snapshot.value.sourceId,revision,authority:snapshot.value.authority,
    sourceUrl:snapshot.value.url,capturedAt:snapshot.value.capturedAt,
    contentSha256:digest.sha256,byteLength:digest.byteLength,
    status:"integrity_checked_unreviewed",legalApproved:false,effectiveDateVerified:false,
    reviewerAttested:false,releaseEnabled:false,storeBytes:false
 })});
}
export function checkNamibiaSourceEvidenceLedger(items){
 if(!Array.isArray(items)||items.length>1000)return fail("invalid_evidence_ledger");
 const seen=new Set();
 for(const item of items){
  if(!item||item.marketCode!=="NA"||item.status!=="integrity_checked_unreviewed"||
     !validRevision(item.revision)||typeof item.sourceId!=="string"||!shaPattern.test(item.contentSha256)||
     item.legalApproved!==false||item.reviewerAttested!==false||item.releaseEnabled!==false)return fail("invalid_evidence_record");
  const key=item.sourceId+"@"+item.revision;
  if(seen.has(key))return fail("duplicate_source_revision");
  seen.add(key);
 }
 return Object.freeze({ok:true,sourceVersions:items.length,approvedVersions:0,activationReady:false});
}
export function crossCheckNamibiaRuleSource(rule,evidence){
 if(!rule||rule.marketCode!=="NA"||rule.status!=="research_draft"||!evidence||
    evidence.marketCode!=="NA"||evidence.status!=="integrity_checked_unreviewed")return fail("draft_evidence_required");
 if(rule.sourceId!==evidence.sourceId||rule.sourceHash!==evidence.contentSha256||
    rule.sourceUrl!==evidence.sourceUrl||rule.sourceCapturedAt!==evidence.capturedAt)return fail("source_evidence_mismatch");
 return Object.freeze({ok:true,hashMatched:true,legalApproved:false,releaseEnabled:false});
}
