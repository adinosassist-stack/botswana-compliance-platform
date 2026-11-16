// Offline, read-only gate for Workspace Agent inert configuration correction.
// Never sends network requests or writes a remediation payload.
// The settings API may include secrets that cannot safely be round-tripped.
export const INERT_VERSION = '64d9bae9-2ea3-40c1-9a26-83cea97ad71c';
export const STAGING_D1 = 'fa317ccc-683d-4466-9e3a-e296872d58ba';
export const STAGING_NAME = 'bw-workspace-agent-staging';
const EXPECTED_NAMES = new Set([
  'AGENT_BOUNDED_TASK_EXECUTION_ENABLED','APP_ENV','PAYMENT_PROVIDER',
  'POP_UPLOAD_STAGING_ENABLED','THEBE_GENERAL_AI_ENABLED',
  'THEBE_INTERNAL_AUTONOMY_ENABLED','THEBE_LIVE_VOICE_ENABLED',
  'WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED',
]);
const EXPECTED_VALUES = {
  AGENT_BOUNDED_TASK_EXECUTION_ENABLED: '0',
  APP_ENV: 'staging',
  PAYMENT_PROVIDER: 'none',
  POP_UPLOAD_STAGING_ENABLED: 'false',
  THEBE_GENERAL_AI_ENABLED: 'false',
  THEBE_INTERNAL_AUTONOMY_ENABLED: 'false',
  THEBE_LIVE_VOICE_ENABLED: 'false',
  WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED: 'false',
};
function validEnvelope(obj) {return obj && obj.success===true && obj.result && typeof obj.result==='object';}
export function assessInertSnapshot(snapshot) {
  const issues=[];
  if (!snapshot || typeof snapshot!=='object') return {safe:false,issues:['missing_snapshot']};
  const {deployments,settings,subdomain,schedules,domains,database}=snapshot;
  if (!validEnvelope(deployments) ||
    deployments.result.deployments?.[0]?.versions?.length!==1 ||
    deployments.result.deployments[0].versions[0].version_id!==INERT_VERSION ||
    deployments.result.deployments[0].versions[0].percentage!==100)
    issues.push('pinned_version_not_100pct');
  if (!validEnvelope(subdomain) || subdomain.result.enabled!==false ||
    subdomain.result.previews_enabled!==false) issues.push('public_access_not_disabled');
  if (!validEnvelope(schedules) || !Array.isArray(schedules.result.schedules) ||
    schedules.result.schedules.length!==0) issues.push('schedules_not_empty');
  if (!validEnvelope(domains) || !Array.isArray(domains.result) ||
    domains.result.length!==0) issues.push('custom_domains_not_empty');
  if (!validEnvelope(database) || database.result.uuid!==STAGING_D1 ||
    database.result.name!==STAGING_NAME || database.result.num_tables!==0)
    issues.push('dedicated_d1_not_empty');
  if (!validEnvelope(settings) || !Array.isArray(settings.result.bindings)) {
    issues.push('settings_unavailable');
  } else {
    const bindings=settings.result.bindings;
    if (bindings.some(b=>!b || !['plain_text','d1'].includes(b.type)))
      issues.push('secret_or_unknown_binding_requires_independent_procedure');
    const d1=bindings.filter(b=>b?.type==='d1');
    if (d1.length!==1 || d1[0].name!=='DB' || d1[0].id!==STAGING_D1)
      issues.push('unexpected_resource_binding');
    const plain=bindings.filter(b=>b?.type==='plain_text');
    if (plain.length!==EXPECTED_NAMES.size ||
      new Set(plain.map(b=>b.name)).size!==EXPECTED_NAMES.size ||
      plain.some(b=>!EXPECTED_NAMES.has(b.name))) issues.push('unknown_or_missing_plain_text_binding');
    for (const [name,value] of Object.entries(EXPECTED_VALUES)) {
      const b=plain.filter(x=>x.name===name);
      if (b.length!==1 || (name==='WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED'
        ? !['true','false'].includes(b[0].text)
        : b[0].text!==value))
        issues.push('unexpected_variable_'+name);
    }
    if (plain.find(x=>x.name==='WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED')?.text!=='true')
      issues.push('no_expected_advisory_flag_mismatch');
  }
  // Deliberately *never* produce a settings PATCH body or a credential snapshot.
  return {safe:issues.length===0,issues};
}
