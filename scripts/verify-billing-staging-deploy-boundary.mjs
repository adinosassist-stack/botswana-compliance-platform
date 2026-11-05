// Fail-closed, credential-free verification of a proposed existing billing-staging rollout.
// Provider metadata is read by the protected workflow, never stored in git or artifacts.
export const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
export const STAGING_DB='9d1b8852-4424-46e9-ba24-cdad5ced215f';
export const PROD_DB='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
export const BUCKET='bw-billing-staging-pop';
const expected={APP_ENV:'staging',DEPLOYMENT_PROFILE:'billing-staging-readonly',PAYMENT_PROVIDER:'none',POP_UPLOAD_STAGING_ENABLED:'false',
  BILLING_STAGING_D1_ID:STAGING_DB, PUBLIC_ORIGIN:'https://billing-staging.thebedesk.com',PUBLIC_APP_URL:'https://billing-staging.thebedesk.com'};
const fail=x=>{throw Error('billing_staging_deploy_hold_'+x)};
export function verifyBillingDeployBoundary({settings,marker,publicBucket,customDomains,subdomain,domains,adminEmails}={}){
  if(settings?.success!==true||!Array.isArray(settings.result?.bindings))fail('worker_metadata_unavailable');
  const b=settings.result.bindings;
  const exact=name=>{const matches=b.filter(x=>x.name===name);if(matches.length!==1)fail('missing_or_duplicate_'+name);return matches[0]};
  for(const [name,value] of Object.entries(expected)){
    const e=exact(name);if(e.type!=='plain_text'||e.text!==value)fail('flag_'+name);
  }
  if(!adminEmails||typeof adminEmails!=='string'||exact('PLATFORM_ADMIN_EMAILS').text!==adminEmails)fail('admin_identity_changed');
  const db=exact('DB');
  if(db.type!=='d1'||(db.id??db.database_id)!==STAGING_DB)fail('db_mismatch');
  const bucket=exact('EVIDENCE');
  if(bucket.type!=='r2_bucket'||bucket.bucket_name!==BUCKET)fail('r2_mismatch');
  for(const name of ['SESSION_SECRET','AUDIT_INTEGRITY_SECRET'])if(exact(name).type!=='secret_text')fail('secret_missing_'+name);
  if(b.some(x=>x.type==='d1'&&(x.id??x.database_id)===PROD_DB))fail('production_db_bound');
  if(marker?.success!==true||marker.result?.[0]?.success!==true||marker.result[0].results?.length!==1||
    marker.result[0].results[0].database_id!==STAGING_DB||marker.result[0].results[0].environment!=='billing-staging'||
    marker.result[0].meta?.rows_written!==0)fail('db_marker');
  if(publicBucket?.success!==true||publicBucket.result?.enabled!==false)fail('public_bucket_enabled');
  if(customDomains?.success!==true||!Array.isArray(customDomains.result?.domains)||customDomains.result.domains.length!==0)fail('public_bucket_custom_domains');
  if(subdomain?.success!==true||subdomain.result?.enabled!==false||subdomain.result?.previews_enabled!==false)fail('public_worker_subdomain');
  if(domains?.success!==true||!Array.isArray(domains.result)||domains.result.filter(x=>x.service==='bw-billing-staging').length!==1||
    !domains.result.some(x=>x.service==='bw-billing-staging'&&x.hostname==='billing-staging.thebedesk.com'))fail('worker_domain');
  return {ok:true,worker:'bw-billing-staging',stagingDb:STAGING_DB,privateBucket:true,existingSecretsPresent:true,readOnly:true};
}
