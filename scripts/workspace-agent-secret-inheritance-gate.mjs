// Fail-closed planner for Worker binding repair. NO Cloudflare network operations.
// Cloudflare script settings PATCH inherits secret bindings only from "latest".
// Do not produce a plan unless latest uploaded == currently deployed pinned inert.
// The returned plan is a non-executable manifest; never log secret-bearing API replies.
export const PINNED_INERT_VERSION = '64d9bae9-2ea3-40c1-9a26-83cea97ad71c';
export const D1_ID = 'fa317ccc-683d-4466-9e3a-e296872d58ba';
const REQUIRED = Object.freeze({
  AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0',APP_ENV:'staging',PAYMENT_PROVIDER:'none',
  POP_UPLOAD_STAGING_ENABLED:'false',THEBE_GENERAL_AI_ENABLED:'false',
  THEBE_INTERNAL_AUTONOMY_ENABLED:'false',THEBE_LIVE_VOICE_ENABLED:'false',
  WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:'true',
  WORKSPACE_AGENT_ADVISORY_STAGING_HOST:'workspace-agent-staging.thebedesk.com',
});
export function auditSecretInheritance({settings,deployments,versions}={}) {
  const errors=[];
  const bindings=settings?.result?.bindings;
  const actual=deployments?.result?.deployments?.[0]?.versions;
  const latest=versions?.result?.items?.[0]?.id;
  if(settings?.success!==true||!Array.isArray(bindings)) errors.push('settings_unavailable');
  if(deployments?.success!==true||!Array.isArray(actual)||actual.length!==1||
    actual[0]?.version_id!==PINNED_INERT_VERSION||actual[0]?.percentage!==100)
    errors.push('pinned_inert_not_fully_deployed');
  // IMPORTANT: latest uploaded version may be stranded candidate; never infer from Ready.
  if(versions?.success!==true || typeof latest!=='string' || latest!==PINNED_INERT_VERSION)
    errors.push('latest_uploaded_version_not_verified_pinned_inert');
  if(Array.isArray(bindings)) {
    const names=bindings.map(b=>b?.name);
    if(new Set(names).size!==names.length)errors.push('duplicate_binding_names');
    const d1=bindings.filter(b=>b?.type==='d1');
    if(d1.length!==1||d1[0].name!=='DB'||d1[0].id!==D1_ID)
      errors.push('expected_d1_mismatch');
    const secret=bindings.filter(b=>b?.type==='secret_text');
    if(secret.length!==1 || secret[0]?.name!=='SESSION_SECRET')
      errors.push('secret_binding_identity_mismatch');
    const plain=bindings.filter(b=>b?.type==='plain_text');
    if(plain.length!==Object.keys(REQUIRED).length ||
      plain.some(b=>!Object.hasOwn(REQUIRED,b.name)||REQUIRED[b.name]!==b.text))
      errors.push('plain_text_binding_mismatch');
    if(bindings.some(b=>!['d1','plain_text','secret_text'].includes(b?.type)))
      errors.push('unknown_binding_type');
    if(bindings.length!==1+1+Object.keys(REQUIRED).length)
      errors.push('unexpected_binding_count');
  }
  // Intentionally do not output a PATCH body. Inheritance must be independently reviewed.
  return {readyForHumanPayloadReview:errors.length===0, errors};
}
