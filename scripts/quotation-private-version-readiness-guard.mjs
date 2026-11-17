/**
 * PURE, READ-ONLY assessment of the already uploaded, UNDEPLOYED
 * quotation 404-only bootstrap and readiness to REQUEST a separate
 * staging approval. Never uploads a Worker version, touches D1/R2 or
 * grants deployment permission. Results are only as reliable as independently
 * authenticated Cloudflare GET responses supplied by the operator.
 */
const expected=Object.freeze({
 account:"ddd23cab31928a4bb3d4998df9b26d1d",
 name:"bw-quotation-auth-private-staging",
 worker:"bcaaf366ef7349a1a76a3a66735cb3af",
 version:"cc20de6e-ab08-409f-89a1-390e0eaf5be1",
 module:"quotation-private-bootstrap-deny-all.mjs"
});
const sha40=/^[0-9a-f]{40}$/;
const noEntries=x=>Array.isArray(x)&&x.length===0;
export function assessQuotationPrivateVersionReadiness({
 accountId,mainSha,sourceHeadSha,worker,versions,deployments,
 routes,domains,versionBindings,authCounts,authReadOnlyVerified
}={}){
 const failures=[];
 if(accountId!==expected.account)failures.push("account_identity_mismatch");
 if(!sha40.test(sourceHeadSha)||mainSha!==sourceHeadSha)
  failures.push("exact_main_source_not_verified");
 if(worker?.id!==expected.worker||worker?.name!==expected.name)
  failures.push("worker_identity_mismatch");
 if(worker?.deployed_on!==null||worker?.subdomain?.enabled!==false||
    worker?.subdomain?.previews_enabled!==false)
  failures.push("worker_undeployed_or_urls_disabled_unverified");
 if(!noEntries(worker?.references?.domains)||
    !noEntries(worker?.references?.workers))
  failures.push("worker_references_unverified");
 if(!Array.isArray(versions)||versions.length!==1||
    (versions[0].id??versions[0].uuid)!==expected.version||
    versions[0].main_module!==expected.module||
    !noEntries(versions[0].urls))
  failures.push("approved_static_version_unverified");
 if(!noEntries(deployments))failures.push("deployment_absence_unverified");
 if(!noEntries(routes)||!noEntries(domains))
  failures.push("public_route_domain_absence_unverified");
 if(!noEntries(versionBindings))
  failures.push("version_binding_absence_unverified");
 if(authReadOnlyVerified!==true||!Array.isArray(authCounts)||
    authCounts.length!==3||authCounts.some(x=>!x||typeof x.table!=="string"||
     x.count!==0)||
    new Set(authCounts.map(x=>x.table)).size!==3||
    ["users","memberships","sessions"].some(name=>
     !authCounts.some(x=>x.table===name&&x.count===0)))
  failures.push("synthetic_auth_empty_not_verified");
 return Object.freeze({
  qualification:"read_only",
  safeForSeparateStagingApprovalRequest:failures.length===0,
  failures:Object.freeze(failures),
  // These flags are intentionally NEVER true, even with a clear snapshot.
  deploymentAuthorized:false,versionUploadAuthorized:false,
  bindingAuthorized:false,templateUploadAuthorized:false,
  customerIssuanceAuthorized:false,productionAuthorized:false,
  independentReviewerRequired:"thusico"
 });
}
