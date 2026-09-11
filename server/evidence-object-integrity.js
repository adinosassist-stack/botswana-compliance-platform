function normalizedMime(v){return String(v||"").trim().toLowerCase()}
function metadataValue(metadata,key){
  if(!metadata||typeof metadata!=="object")return "";
  const wanted=String(key||"").toLowerCase();
  for(const [k,v] of Object.entries(metadata))if(String(k).toLowerCase()===wanted)return String(v||"");
  return "";
}
export function verifyEvidenceObjectHead(head,{expectedSize,contentType,tenantId,evidenceId}){
  const actualSize=Number(head?.ContentLength??NaN),actualType=normalizedMime(head?.ContentType);
  const expectedType=normalizedMime(contentType),actualTenant=metadataValue(head?.Metadata,"tenant"),actualEvidence=metadataValue(head?.Metadata,"evidence");
  const checks={
    size:Number.isFinite(actualSize)&&actualSize===Number(expectedSize),
    contentType:!!expectedType&&actualType===expectedType,
    tenant:!!tenantId&&actualTenant===String(tenantId),
    evidence:!!evidenceId&&actualEvidence===String(evidenceId)
  };
  if(Object.values(checks).every(Boolean))return {ok:true,checks,actual:{size:actualSize,contentType:actualType}};
  return {ok:false,error:"uploaded_object_metadata_mismatch",checks,actual:{size:Number.isFinite(actualSize)?actualSize:null,contentType:actualType,tenant:actualTenant||null,evidence:actualEvidence||null}};
}
