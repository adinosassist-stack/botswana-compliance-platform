/**
 * Pure, NO-NETWORK guard for an EMPTY Cloudflare Worker RESOURCE.
 *
 * This guards a proposal using the newer POST /workers/workers endpoint.
 * It never creates resources, deploys versions, fetches secrets, or mutates
 * Cloudflare, D1, R2, GitHub or production.
 *
 * Do NOT reuse approval for failed POST /workers/scripts/.../versions.
 */
const EXPECTED_ACCOUNT = 'ddd23cab31928a4bb3d4998df9b26d1d';
const EXPECTED_WORKER = 'bw-quotation-auth-private-staging';
// The expected SHA is supplied from a separately authorized exact-source
// GitHub approval, not from a hardcoded pre-merge branch base or live HEAD.
// A missing or malformed expected source must always fail closed.
const EXACT_SHA_PATTERN = /^[a-f0-9]{40}$/;

function namesAreAbsent(scripts, workers) {
  if (!Array.isArray(scripts) || !Array.isArray(workers)) return false;
  return scripts.every(x => (x?.id ?? x?.name) !== EXPECTED_WORKER) &&
    workers.every(x => x?.name !== EXPECTED_WORKER && x?.id !== EXPECTED_WORKER);
}
function noAssociations(routes, domains) {
  if (!Array.isArray(routes) || !Array.isArray(domains)) return false;
  return routes.every(x => !JSON.stringify(x).includes(EXPECTED_WORKER)) &&
    domains.every(x => !JSON.stringify(x).includes(EXPECTED_WORKER));
}
function countsAreEmpty(counts) {
  if (!Array.isArray(counts) || counts.length !== 3) return false;
  const expected = ['users', 'memberships', 'sessions'].sort();
  return counts.every(x => typeof x?.n === 'number' && x.n === 0) &&
    counts.map(x => x.tab).sort().join(',') === expected.join(',');
}

export function assessEmptyWorkerResourcePreflight({
  accountId, mainSha, approvedMainSha, legacyScripts, modernWorkers, routes, domains,
  authCounts, readOnlyVerified
} = {}) {
  const failures = [];
  if (accountId !== EXPECTED_ACCOUNT) failures.push('account_mismatch');
  if (typeof approvedMainSha !== 'string' ||
    !EXACT_SHA_PATTERN.test(approvedMainSha) ||
    mainSha !== approvedMainSha) failures.push('source_sha_mismatch_or_approval_missing');
  if (!namesAreAbsent(legacyScripts, modernWorkers))
    failures.push('worker_already_present_or_inventory_unverified');
  if (!noAssociations(routes, domains))
    failures.push('existing_route_domain_or_inventory_unverified');
  if (readOnlyVerified !== true || !countsAreEmpty(authCounts))
    failures.push('isolated_auth_database_not_proven_empty');
  return { readyForSeparatelyApprovedCreate: failures.length === 0, failures };
}

export function assessEmptyWorkerResourcePostflight({
  accountId, worker, workerVersions, workerDeployments,
  legacyScripts, modernWorkers, routes, domains, bindings,
  sourceCodeUploaded
} = {}) {
  const failures = [];
  if (accountId !== EXPECTED_ACCOUNT) failures.push('account_mismatch');
  if (worker?.name !== EXPECTED_WORKER ||
    typeof worker?.id !== 'string' || worker.id.length === 0)
    failures.push('worker_identity_unverified');
  if (worker?.deployed_on !== null)
    failures.push('deployment_state_not_proven_never_deployed');
  if (worker?.subdomain?.enabled !== false ||
    worker?.subdomain?.previews_enabled !== false)
    failures.push('public_or_preview_url_not_disabled');
  if (!Array.isArray(modernWorkers) ||
    modernWorkers.filter(x => x?.name === EXPECTED_WORKER).length !== 1 ||
    !Array.isArray(legacyScripts))
    failures.push('worker_inventory_unverified');
  if (!Array.isArray(workerVersions) || workerVersions.length !== 0)
    failures.push('version_present_or_unverified');
  if (!Array.isArray(workerDeployments) || workerDeployments.length !== 0)
    failures.push('deployment_present_or_unverified');
  if (!Array.isArray(bindings) || bindings.length !== 0)
    failures.push('binding_present_or_unverified');
  if (!noAssociations(routes, domains))
    failures.push('route_or_domain_present_or_unverified');
  if (sourceCodeUploaded !== false)
    failures.push('source_upload_state_unverified');
  // Cloudflare can return a workers.dev url field even when disabled.
  // Its mere presence is not proof of public accessibility.
  return { noCodeNoTrafficVerified: failures.length === 0, failures };
}
