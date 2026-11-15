// Read-only, fail-closed deployment-specific inert binding guard.
// This audits the version deployed at 100%, NOT script settings or the latest upload.
// Never returns raw binding values or any Worker mutation payload.
export const PINNED_INERT='64d9bae9-2ea3-40c1-9a26-83cea97ad71c';
export const KNOWN_UNSAFE_LATEST='9ba41e62-9efc-49c5-9d4e-d667057e43fb';
const expected=Object.freeze({
 AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0',
 APP_ENV:'staging',
 PAYMENT_PROVIDER:'none',
 POP_UPLOAD_STAGING_ENABLED:'false',
 THEBE_GENERAL_AI_ENABLED:'false',
 THEBE_INTERNAL_AUTONOMY_ENABLED:'false',
 THEBE_LIVE_VOICE_ENABLED:'false',
 WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:'false'
});
export function inspectInertDeployed({pinned,latest,deployments}={}) {
 const issues=[];
 const versions=deployments?.result?.deployments?.[0]?.versions;
 if(deployments?.success!==true||!Array.isArray(versions)||versions.length!==1||
    versions[0]?.version_id!==PINNED_INERT||versions[0]?.percentage!==100)
   issues.push('pinned_deployment_changed');
 if(pinned?.success!==true||pinned?.result?.id!==PINNED_INERT)
   issues.push('pinned_version_identity_unverified');
 const bindings=pinned?.result?.bindings;
 if(!Array.isArray(bindings)||bindings.length!==Object.keys(expected).length)
   issues.push('inert_binding_count_mismatch');
 if(Array.isArray(bindings)){
   if(bindings.some(b=>b?.type!=='plain_text'||!Object.hasOwn(expected,b?.name)||
      b.text!==expected[b.name])||
      new Set(bindings.map(b=>b?.name)).size!==Object.keys(expected).length)
      issues.push('inert_binding_value_or_type_mismatch');
 }
 if(latest?.success!==true || latest?.result?.id!==KNOWN_UNSAFE_LATEST)
   issues.push('latest_upload_identity_changed');
 return {deployedInertSafe:issues.length===0,
   latestPromotionBlocked:true,issues};
}
