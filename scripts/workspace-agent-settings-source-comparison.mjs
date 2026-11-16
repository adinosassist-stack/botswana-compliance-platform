// Read-only, redacted classification of two Cloudflare Worker settings surfaces.
// Version-specific and service-level settings are NOT interchangeable.
// Do not log API responses, secret values, or variable values.
const PINNED='64d9bae9-2ea3-40c1-9a26-83cea97ad71c';
const D1_ID='fa317ccc-683d-4466-9e3a-e296872d58ba';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
function readBindings(doc) {
  return doc?.success===true&&Array.isArray(doc?.result?.bindings)?doc.result.bindings:null;
}
function presence(bindings,type,name,extra=()=>true) {
  if(!bindings) return 'unverified';
  const xs=bindings.filter(b=>b?.name===name);
  if(xs.length===0)return 'absent';
  return xs.length===1&&xs[0].type===type&&extra(xs[0])?'present':'unexpected';
}
function flag(bindings) {
  if(!bindings)return 'unverified';
  const xs=bindings.filter(b=>b?.name==='WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED');
  if(xs.length===0)return 'absent';
  if(xs.length!==1||xs[0].type!=='plain_text')return 'unexpected';
  return xs[0].text==='true'?'true':xs[0].text==='false'?'false':'unexpected';
}
function classify(bindings) {
  return {
    sessionSecret:presence(bindings,'secret_text','SESSION_SECRET'),
    d1:presence(bindings,'d1','DB',b=>b.id===D1_ID),
    advisoryFlag:flag(bindings),
    numberOfBindings:bindings?.length??null,
  };
}
export function compareWorkerSettingsSources({version,script,latest,deployments}={}) {
  const issues=[];
  if(version?.success!==true||version?.result?.id!==PINNED)issues.push('pinned_version_id_unverified');
  if(script?.success!==true)issues.push('script_settings_unverified');
  if(latest?.success!==true||!UUID.test(latest?.result?.id??''))issues.push('latest_version_unverified');
  const versions=deployments?.result?.deployments?.[0]?.versions;
  if(deployments?.success!==true||!Array.isArray(versions)||versions.length!==1||
    versions[0]?.version_id!==PINNED||versions[0]?.percentage!==100)
    issues.push('inert_deployment_changed');
  const vb=readBindings(version),sb=readBindings(script);
  if(!vb)issues.push('version_binding_list_unavailable');
  if(!sb)issues.push('script_binding_list_unavailable');
  if(vb && new Set(vb.map(b=>b?.name)).size!==vb.length)
    issues.push('duplicate_version_bindings');
  if(sb && new Set(sb.map(b=>b?.name)).size!==sb.length)
    issues.push('duplicate_script_bindings');
  const pinnedVersion=classify(vb),scriptSettings=classify(sb);
  const latestIsPinned=issues.length===0&&latest.result.id===PINNED;
  const sourcesDiffer=issues.length===0&&
    JSON.stringify(pinnedVersion)!==JSON.stringify(scriptSettings);
  return {
    verified:issues.length===0,
    latestIsPinned,
    sourcesDiffer,
    pinnedVersion,
    scriptSettings,
    // A source disagreement or unrelated latest upload MUST block mutation.
    repairBlocked:issues.length!==0||!latestIsPinned||sourcesDiffer,
    issues
  };
}
