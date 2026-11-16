// Pure, fail-closed Cloudflare Worker uploaded-version provenance audit.
// No API access, payload mutation, Worker deployment, or secrets access.
export const PINNED_INERT = '64d9bae9-2ea3-40c1-9a26-83cea97ad71c';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const reject = reason => ({valid:false,canInheritFromLatest:false,reason});
export function checkVersionLineage(first, second, deployment) {
  if (first?.success!==true || !Array.isArray(first?.result?.items) ||
      second?.success!==true || !Array.isArray(second?.result?.items))
    return reject('version_list_schema_unrecognized');
  const items=first.result.items;
  if (items.length<2 || items.length>100 || second.result.items.length!==0)
    return reject('version_list_incomplete_or_paginated');
  if(items.some(v => !UUID.test(v?.id??'') ||
    !Number.isSafeInteger(v?.number) || v.number<1 ||
    !ISO.test(v?.metadata?.created_on??'')))
    return reject('version_metadata_invalid');
  if (new Set(items.map(v=>v.id)).size!==items.length ||
      new Set(items.map(v=>v.number)).size!==items.length)
    return reject('duplicate_version_identity');
  if (!items.some(v=>v.id===PINNED_INERT))
    return reject('pinned_inert_absent_from_versions');
  if(deployment?.success!==true ||
    !Array.isArray(deployment?.result?.deployments) ||
    !Array.isArray(deployment.result.deployments[0]?.versions) ||
    deployment.result.deployments[0].versions.length!==1 ||
    deployment.result.deployments[0].versions[0].version_id!==PINNED_INERT ||
    deployment.result.deployments[0].versions[0].percentage!==100)
    return reject('pinned_inert_not_deployed_100pct');
  // API documents 'number' as sequential version number. We do not infer newest from
  // response order or from display labels ("Ready", "Deployed").
  const newest=items.reduce((a,b)=>a.number>b.number?a:b);
  return {valid:true,canInheritFromLatest:newest.id===PINNED_INERT,
    reason:newest.id===PINNED_INERT?'version_lineage_consistent':'latest_upload_differs_from_pinned'};
}
