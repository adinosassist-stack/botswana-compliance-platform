import crypto from "crypto";
function segment(v){return encodeURIComponent(String(v??""))}
export function evidenceStagingKey(tenantId,companyId){
  return `staging/tenant/${segment(tenantId)}/company/${segment(companyId)}/${crypto.randomUUID()}`;
}
export function evidenceCommittedKey(tenantId,companyId,evidenceId){
  return `quarantine/tenant/${segment(tenantId)}/company/${segment(companyId)}/evidence/${segment(evidenceId)}/${crypto.randomUUID()}`;
}
export function s3CopySource(bucket,key){
  const safeKey=String(key||"").split("/").map(encodeURIComponent).join("/");
  return `${String(bucket||"")}/${safeKey}`;
}
