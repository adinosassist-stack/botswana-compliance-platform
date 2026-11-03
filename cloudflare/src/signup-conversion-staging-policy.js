export const SIGNUP_STAGING_ORIGIN='https://signup-staging.thebedesk.com';
export const SIGNUP_STAGING_PROFILE='signup-conversion-staging';
export const SIGNUP_STAGING_EMAILS=Object.freeze(['alpha.signup-staging@example.invalid','beta.signup-staging@example.invalid']);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const FORBIDDEN=new Set(['8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce','20c0d37e-552e-438f-a56d-3f12c27d38e2']);

export function signupStagingIdentity(env){
  const keys=['SIGNUP_STAGING_D1_ID','PRODUCTION_D1_DATABASE_ID','BILLING_STAGING_D1_ID','REGULATORY_STAGING_D1_ID'];
  const ids=keys.map(key=>String(env?.[key]||'').toLowerCase());
  if(ids.some(id=>!UUID.test(id)))throw Error('signup_staging_database_identities_required');
  if(ids.slice(1).includes(ids[0])||FORBIDDEN.has(ids[0]))throw Error('signup_staging_database_forbidden');
  const sourceSha=String(env?.SIGNUP_STAGING_SOURCE_SHA||'');
  if(!/^[a-f0-9]{40}$/.test(sourceSha))throw Error('signup_staging_exact_sha_required');
  return {databaseId:ids[0],sourceSha};
}
