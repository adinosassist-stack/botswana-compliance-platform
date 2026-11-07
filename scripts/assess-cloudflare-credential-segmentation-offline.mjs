// Offline metadata-only credential exposure assessor. No authentication, token values or API calls.
// Flags observed privileges; never grants restore, rotation or production-release authority.
const fail=reason=>{throw Error('credential_scope_hold_'+reason)};
const RISK=new Set(['D1 Write','Workers R2 Storage Write','Workers Scripts Write','Workers KV Storage Write','Workers AI Write','Workers Containers Write','Workers CI Write']);
const EXPECTED='Thebe Desk GitHub Production Deploy v2';
const ACCOUNT='com.cloudflare.api.account.ddd23cab31928a4bb3d4998df9b26d1d';
const fields=(x,keys)=>{if(!x||Array.isArray(x)||typeof x!=='object'||Object.keys(x).length!==keys.length||keys.some(k=>!Object.hasOwn(x,k)))fail('shape')};
export function assessCredentialSegmentation(input){
 fields(input,['accountId','observedMainSha','tokens','accountTokenListingComplete','userTokenMetadataComplete','historicalWorkerBindingsComplete','r2S3KeyInventoryComplete']);
 if(input.accountId!=='ddd23cab31928a4bb3d4998df9b26d1d'||!/^[a-f0-9]{40}$/.test(input.observedMainSha))fail('identity');
 if(!Array.isArray(input.tokens)||input.tokens.length<1||input.tokens.length>100||input.accountTokenListingComplete!==true)fail('incomplete_account_tokens');
 const names=new Set();
 for(const t of input.tokens){
  fields(t,['name','status','policies']);
  if(typeof t.name!=='string'||t.name.length<1||t.name.length>128||names.has(t.name)||!['active','disabled','expired'].includes(t.status)||!Array.isArray(t.policies))fail('token_identity');
  names.add(t.name);
  for(const p of t.policies){
   fields(p,['effect','resources','permissions']);
   if(!['allow','deny'].includes(p.effect)||!Array.isArray(p.resources)||!Array.isArray(p.permissions)||p.resources.some(x=>typeof x!=='string')||p.permissions.some(x=>typeof x!=='string'))fail('policy_shape');
  }
 }
 const selected=input.tokens.find(t=>t.name===EXPECTED);
 if(!selected)fail('deployment_token_missing');
 const broad=[...new Set(selected.policies.filter(p=>p.effect==='allow'&&p.resources.includes(ACCOUNT)).flatMap(p=>p.permissions.filter(x=>RISK.has(x))))].sort();
 return Object.freeze({
  kind:'cloudflare_credential_segmentation_offline_evidence',
  inspectedToken:EXPECTED,accountWriteCapabilities:broad,
  broadAccountWritePrivilegesObserved:selected.status==='active'&&broad.length>0,
  userTokenInventoryUnverified:input.userTokenMetadataComplete!==true,
  historicalWorkerInventoryUnverified:input.historicalWorkerBindingsComplete!==true,
  r2S3KeysUnverified:input.r2S3KeyInventoryComplete!==true,
  secretStorageAndUseVerified:false,credentialValueInspected:false,
  actualLeastPrivilegeEstablished:false,restoreTargetExclusiveWriteEstablished:false,
  retentionAndAccessAccepted:false,restoreAuthorized:false,
  credentialRotationAuthorized:false,productionWriteAuthorized:false,
  disposition:'HOLD_REVIEW_AND_TEST_INDEPENDENT_CREDENTIAL_SEGMENTATION'
 });
}
