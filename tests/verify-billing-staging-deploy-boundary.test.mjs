import test from 'node:test';import assert from 'node:assert/strict';
import {verifyBillingDeployBoundary as verify,STAGING_DB,BUCKET} from '../scripts/verify-billing-staging-deploy-boundary.mjs';
const admin='staging.owner@example.invalid';
const data=()=>{
 const entries={APP_ENV:'staging',DEPLOYMENT_PROFILE:'billing-staging-readonly',PAYMENT_PROVIDER:'none',POP_UPLOAD_STAGING_ENABLED:'false',BILLING_STAGING_D1_ID:STAGING_DB,
 PUBLIC_ORIGIN:'https://billing-staging.thebedesk.com',PUBLIC_APP_URL:'https://billing-staging.thebedesk.com',PLATFORM_ADMIN_EMAILS:admin};
 return {adminEmails:admin,settings:{success:true,result:{bindings:[...Object.entries(entries).map(([name,text])=>({name,text,type:'plain_text'})),
 {name:'DB',type:'d1',id:STAGING_DB},{name:'EVIDENCE',type:'r2_bucket',bucket_name:BUCKET},
 {name:'SESSION_SECRET',type:'secret_text'},{name:'AUDIT_INTEGRITY_SECRET',type:'secret_text'}]}},
 marker:{success:true,result:[{success:true,results:[{database_id:STAGING_DB,environment:'billing-staging'}],meta:{rows_written:0}}]},
 publicBucket:{success:true,result:{enabled:false}},customDomains:{success:true,result:{domains:[]}},
 subdomain:{success:true,result:{enabled:false,previews_enabled:false}},domains:{success:true,result:[{hostname:'billing-staging.thebedesk.com',service:'bw-billing-staging'}]}};
};
test('accepts exact existing dedicated private staging state',()=>assert.equal(verify(data()).ok,true));
test('blocks changed provider, disabled guard or source-bound production DB',()=>{
 for(const [n,v] of [['PAYMENT_PROVIDER','dpo'],['POP_UPLOAD_STAGING_ENABLED','true'],['APP_ENV','production']]){
 const x=data();x.settings.result.bindings.find(e=>e.name===n).text=v;assert.throws(()=>verify(x),/billing_staging_deploy_hold/);
 }
 const x=data();x.settings.result.bindings.find(e=>e.name==='DB').id='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';assert.throws(()=>verify(x));
});
test('blocks changed admin, missing secret, unsafe public exposure and wrong marker',()=>{
 for(const patch of [x=>x.adminEmails='other@example.invalid',x=>x.settings.result.bindings=x.settings.result.bindings.filter(y=>y.name!=='SESSION_SECRET'),
 x=>x.subdomain.result.enabled=true,x=>x.publicBucket.result.enabled=true,
 x=>x.customDomains.result.domains.push({domain:'files.example'}),x=>x.marker.result[0].meta.rows_written=1,
 x=>x.domains.result=[]]){
 const x=data();patch(x);assert.throws(()=>verify(x),/billing_staging_deploy_hold/);
 }
});
