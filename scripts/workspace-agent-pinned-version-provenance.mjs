// Offline classification of exact Cloudflare Worker version metadata.
// No network operations, no secret values and no deployable payloads.
export const PINNED_INERT_VERSION = '64d9bae9-2ea3-40c1-9a26-83cea97ad71c';
export const STAGING_D1_ID = 'fa317ccc-683d-4466-9e3a-e296872d58ba';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function classifyPinnedVersion({pinned,latest,deployments}={}) {
  const issues=[];
  if(pinned?.success!==true||pinned.result?.id!==PINNED_INERT_VERSION||
      !Array.isArray(pinned.result?.bindings))
    issues.push('pinned_version_metadata_unverified');
  if(latest?.success!==true||!uuid.test(latest.result?.id??''))
    issues.push('latest_version_metadata_unverified');
  const allocations=deployments?.result?.deployments?.[0]?.versions;
  if(deployments?.success!==true||!Array.isArray(allocations)||
      allocations.length!==1||allocations[0]?.version_id!==PINNED_INERT_VERSION||
      allocations[0]?.percentage!==100)
    issues.push('pinned_version_deployment_changed');
  if(Array.isArray(pinned?.result?.bindings)) {
    const bindings=pinned.result.bindings;
    const names=bindings.map(b=>b?.name);
    if(new Set(names).size!==names.length||names.some(s=>typeof s!=='string'||!s))
      issues.push('duplicate_or_invalid_binding_names');
    if(bindings.filter(b=>b?.type==='secret_text').length!==1||
       !bindings.some(b=>b?.name==='SESSION_SECRET'&&b?.type==='secret_text'))
      issues.push('pinned_secret_binding_missing_or_unexpected');
    if(bindings.filter(b=>b?.type==='d1').length!==1||
      !bindings.some(b=>b?.name==='DB'&&b?.type==='d1'&&b?.id===STAGING_D1_ID))
      issues.push('pinned_d1_binding_mismatch');
    if(!bindings.some(b=>b?.name==='WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED'&&
       b?.type==='plain_text'&&b?.text==='true'))
      issues.push('pinned_advisory_flag_mismatch');
    if(bindings.some(b=>!['plain_text','d1','secret_text'].includes(b?.type)))
      issues.push('unknown_binding_type');
  }
  const latestId=latest?.result?.id;
  return {
    valid:issues.length===0,
    latestMatchesPinned:issues.length===0&&latestId===PINNED_INERT_VERSION,
    secretInheritanceFromLatestBlocked:issues.length!==0||latestId!==PINNED_INERT_VERSION,
    issues
  };
}
