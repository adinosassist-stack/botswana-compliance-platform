// Pure, read-only readiness classification for the *deployed* inert Worker version.
// Cloudflare script settings can describe a different uploaded version.
// Never inspect, log, or re-submit secret values or produce remediation payloads.
export const PINNED_INERT='64d9bae9-2ea3-40c1-9a26-83cea97ad71c';
const VARS=Object.freeze({
  AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0',APP_ENV:'staging',PAYMENT_PROVIDER:'none',
  POP_UPLOAD_STAGING_ENABLED:'false',THEBE_GENERAL_AI_ENABLED:'false',
  THEBE_INTERNAL_AUTONOMY_ENABLED:'false',THEBE_LIVE_VOICE_ENABLED:'false',
  WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:'false',
});
function exactlyInert(bindings) {
  if(!Array.isArray(bindings)||bindings.length!==Object.keys(VARS).length)return false;
  const seen=new Set();
  for (const b of bindings) {
    if(!b||b.type!=='plain_text'||typeof b.name!=='string'||
      !Object.hasOwn(VARS,b.name)||b.text!==VARS[b.name]||seen.has(b.name))return false;
    seen.add(b.name);
  }
  return seen.size===Object.keys(VARS).length;
}
export function qualifyInertSurfaces({pinned,service,latest,deployments}={}) {
  const result={
    pinnedDeployed:false, deployedBindingsSafe:false, serviceMatchesPinned:false,
    latestMatchesPinned:false, runtimeSafetyQualified:false, fullStagingQualified:false,
    blockers:[],
  };
  const active=deployments?.result?.deployments?.[0]?.versions;
  result.pinnedDeployed=deployments?.success===true&&Array.isArray(active)&&
    active.length===1&&active[0]?.version_id===PINNED_INERT&&active[0]?.percentage===100;
  result.deployedBindingsSafe=pinned?.success===true&&pinned?.result?.id===PINNED_INERT&&
    exactlyInert(pinned?.result?.bindings);
  result.serviceMatchesPinned=service?.success===true&&
    exactlyInert(service?.result?.bindings);
  result.latestMatchesPinned=latest?.success===true&&latest?.result?.id===PINNED_INERT;
  if(!result.pinnedDeployed)result.blockers.push('pinned_inert_deployment_changed');
  if(!result.deployedBindingsSafe)result.blockers.push('deployed_inert_binding_safety_unverified');
  if(!result.serviceMatchesPinned)result.blockers.push('service_settings_diverge_from_inert');
  if(!result.latestMatchesPinned)result.blockers.push('latest_uploaded_version_diverges');
  result.runtimeSafetyQualified=result.pinnedDeployed&&result.deployedBindingsSafe;
  result.fullStagingQualified=result.runtimeSafetyQualified&&
    result.serviceMatchesPinned&&result.latestMatchesPinned;
  return result;
}
