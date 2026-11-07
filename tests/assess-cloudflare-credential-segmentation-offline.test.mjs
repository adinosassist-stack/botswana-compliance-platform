import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCredentialSegmentation} from '../scripts/assess-cloudflare-credential-segmentation-offline.mjs';
const ACCOUNT='com.cloudflare.api.account.ddd23cab31928a4bb3d4998df9b26d1d';
const valid=()=>({
 accountId:'ddd23cab31928a4bb3d4998df9b26d1d',observedMainSha:'a'.repeat(40),
 accountTokenListingComplete:true,userTokenMetadataComplete:false,
 historicalWorkerBindingsComplete:false,r2S3KeyInventoryComplete:false,
 tokens:[{name:'Thebe Desk GitHub Production Deploy v2',status:'active',
  policies:[{effect:'allow',resources:[ACCOUNT],permissions:['D1 Write','Workers R2 Storage Write','Workers Scripts Write','Account Settings Read']}]}]
});
test('active account-wide D1/R2/Workers token is flagged and no authority inferred',()=>{
 const a=assessCredentialSegmentation(valid());
 assert.equal(a.broadAccountWritePrivilegesObserved,true);
 assert.deepEqual(a.accountWriteCapabilities,['D1 Write','Workers R2 Storage Write','Workers Scripts Write']);
 for(const k of ['actualLeastPrivilegeEstablished','restoreTargetExclusiveWriteEstablished','retentionAndAccessAccepted','restoreAuthorized','credentialRotationAuthorized','productionWriteAuthorized'])assert.equal(a[k],false,k);
 assert.equal(a.userTokenInventoryUnverified,true);
 assert.match(a.disposition,/^HOLD_/);
});
test('token scope reduction alone cannot authorize rotation or restore',()=>{
 const v=valid();v.tokens[0].policies[0].permissions=['Account Settings Read'];
 const a=assessCredentialSegmentation(v);
 assert.equal(a.broadAccountWritePrivilegesObserved,false);
 assert.equal(a.actualLeastPrivilegeEstablished,false);
 assert.equal(a.restoreAuthorized,false);
});
test('reject incomplete account listing, changed account, malformed SHA, and missing selected token',()=>{
 for(const patch of [
  {accountTokenListingComplete:false},
  {accountId:'bad'},
  {observedMainSha:'main'},
  {tokens:[{name:'other',status:'active',policies:[]}]},
  {tokens:[...valid().tokens,...valid().tokens]},
  {tokens:[{...valid().tokens[0],secretValue:'never accept'}]}
 ])assert.throws(()=>assessCredentialSegmentation({...valid(),...patch}),/credential_scope_hold_/);
});
test('reject altered policy shapes and untrusted permission/resource structures',()=>{
 for(const policy of [
  {effect:'allow',resources:'*',permissions:['D1 Write']},
  {effect:'allow',resources:[ACCOUNT],permissions:['D1 Write'],credential:'secret'},
  {effect:'allow',resources:[{}],permissions:['D1 Write']},
  {effect:'allow',resources:[ACCOUNT],permissions:[{}]},
  {effect:'granted',resources:[ACCOUNT],permissions:['D1 Write']}
 ])assert.throws(()=>assessCredentialSegmentation({...valid(),tokens:[{...valid().tokens[0],policies:[policy]}]}),/credential_scope_hold_/);
});
test('zone-only permission does not imply same account-wide scope',()=>{
 const v=valid();v.tokens[0].policies[0].resources=['com.cloudflare.api.account.zone.33e363d52b69c4a64dbb8a0891dbb3a9'];
 const a=assessCredentialSegmentation(v);
 assert.equal(a.broadAccountWritePrivilegesObserved,false);
 assert.equal(a.restoreTargetExclusiveWriteEstablished,false);
});
