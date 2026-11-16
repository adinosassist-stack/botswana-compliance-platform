// Draft-only Workspace Agent staging isolation policy. Pure, read-only logic:
// not a Cloudflare API client, deployment workflow, approval or resource writer.
const PLAN_SCHEMA = "thebe.workspace-agent.no-route-plan.v1";
const WORKER_NAME = /^[a-z][a-z0-9-]{2,62}$/;
const exact = (v, expected) => v === expected;
const item = (code, passed) => Object.freeze({code,passed:passed===true});
const stringArray = v => Array.isArray(v) && v.every(x=>typeof x==="string"&&x.length>0);
export function assessWorkspaceAgentNoRoutePlan(plan={}, inventory={}) {
  const worker=plan?.worker || {}, db=plan?.database || {},
        access=plan?.access || {}, flags=plan?.flags || {}, review=plan?.review || {};
  const knownWorkers=inventory?.workers, knownDatabases=inventory?.databases;
  const namesReady=stringArray(knownWorkers)&&stringArray(knownDatabases)
    && knownWorkers.length>0 && knownDatabases.length>0;
  const checks=[
    item("known_draft_contract",exact(plan?.schema,PLAN_SCHEMA) &&
      exact(plan?.phase,"offline-no-route")),
    item("matching_account_inventory",typeof plan?.accountId==="string" &&
      plan.accountId.length>0 && exact(inventory?.accountId,plan.accountId) &&
      typeof inventory?.observedAt==="string" && inventory.observedAt.length>0 &&
      namesReady),
    item("candidate_worker_not_existing",typeof worker.name==="string" &&
      WORKER_NAME.test(worker.name) && namesReady && !knownWorkers.includes(worker.name)),
    item("candidate_database_not_existing",typeof db.name==="string" &&
      WORKER_NAME.test(db.name) && namesReady && !knownDatabases.includes(db.name)),
    item("no_existing_or_production_database_binding",db.databaseId===null &&
      db.syntheticOnly===true && db.productionData===false),
    item("all_worker_inbound_routes_disabled",worker.workersDev===false &&
      worker.previewUrls===false && Array.isArray(worker.routes) &&
      worker.routes.length===0 && Array.isArray(worker.customDomains) &&
      worker.customDomains.length===0),
    item("no_public_or_protected_hostname_yet",access.hostname===null &&
      access.mode==="none" && access.publicIngress===false),
    item("staging_identity_but_preview_flag_off",flags.APP_ENV==="staging" &&
      flags.WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED==="false" &&
      !Object.hasOwn(flags,"WORKSPACE_AGENT_ADVISORY_STAGING_HOST")),
    item("no_pregranted_release_approvals",review.sourceSha===null &&
      review.ownerApprovalId===null && review.reviewerApprovalId===null &&
      review.independentReviewer==="thusico")
  ];
  const staticDraftPassed=checks.every(x=>x.passed);
  return Object.freeze({
    schema:"thebe.workspace-agent.no-route-assessment.v1",
    staticDraftPassed, checks:Object.freeze(checks),
    outcome:staticDraftPassed?"SAFE_TO_REVIEW_DRAFT_ONLY":"DRAFT_STATIC_POLICY_FAILED",
    stagingResourcesProven:false,
    authorizationProven:false,
    privateBrowserAccessProven:false,
    readyForStagingDeployment:false,
    stagingActivationAuthorized:false,
    productionActivationAuthorized:false,
    blockers:Object.freeze([
      "fresh_independently_attested_account_inventory_required",
      "exact_main_source_and_independent_approval_required",
      "dedicated_staging_resources_unprovisioned",
      "no_route_plan_cannot_support_network_browser_activation",
      "separate_private_hostname_access_policy_decision_required"
    ])
  });
}
