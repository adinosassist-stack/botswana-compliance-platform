/**
 * Review-only General AI staging fixture lifecycle.
 * NOT imported by a Worker or workflow. No Cloudflare access, endpoint, routes or deployment.
 * An independently approved harness must supply a restricted staging-only adapter.
 */
const STAGING_DB = "ff229eef-7724-49ae-9d68-d3a1db669b63";
const EXPECTED_WORKER = "bw-general-ai-staging";
const STEPS = Object.freeze(["user", "membership", "session"]);
const assert = (value, code) => { if (!value) throw Error(code); };
const idPattern = /^ga-test-[a-f0-9]{32}$/;

export function assertPrivateFixtureScope(scope) {
  assert(scope?.appEnv === "staging", "fixture_nonstaging_forbidden");
  assert(scope?.databaseId === STAGING_DB, "fixture_db_scope_mismatch");
  assert(scope?.workerName === EXPECTED_WORKER, "fixture_worker_scope_mismatch");
  assert(scope?.generalAiEnabled === false, "fixture_enabled_ai_forbidden");
  assert(scope?.researchEnabled === false, "fixture_research_forbidden");
  assert(scope?.publicRouteEnabled === false, "fixture_public_route_forbidden");
  assert(scope?.independentApproval === true, "fixture_independent_approval_required");
  assert(scope?.stagingWriteApproved === true, "fixture_staging_write_approval_required");
  assert(scope?.exactMainApproved === true, "fixture_exact_main_approval_required");
}

/**
 * The adapter must implement create(kind, fixtureId) and remove(kind, fixtureId),
 * and assertAbsent(fixtureId). It MUST be bound to one separately qualified
 * isolated staging database; no adapter implementation is supplied here.
 * A caller-generated synthetic id is mandatory. Never pass real user identifiers.
 */
export async function withPrivateSyntheticFixture({scope, fixtureId, adapter, exercise}) {
  assertPrivateFixtureScope(scope);
  assert(typeof fixtureId === "string" && idPattern.test(fixtureId), "fixture_synthetic_id_required");
  assert(adapter && ["create", "remove", "assertAbsent"].every(k => typeof adapter[k] === "function"), "fixture_adapter_required");
  assert(typeof exercise === "function", "fixture_exercise_required");
  // Collision guard: check before any create/cleanup bookkeeping. If a synthetic
  // identity already exists, fail without attempting deletion of those records.
  await adapter.assertAbsent(fixtureId);
  const created = [];
  let operationError;
  let result;
  try {
    for (const step of STEPS) {
      // Record before invoking: even a partially successful write must be cleaned.
      created.push(step);
      await adapter.create(step, fixtureId);
    }
    result = await exercise({fixtureId});
  } catch (error) {
    operationError = error;
  }
  const failures = [];
  for (const step of created.reverse()) {
    try { await adapter.remove(step, fixtureId); }
    catch { failures.push(step); }
  }
  try { await adapter.assertAbsent(fixtureId); }
  catch { failures.push("residual_records"); }
  if (failures.length) throw Error("fixture_cleanup_unverified:" + failures.join(","));
  if (operationError) throw operationError;
  return {result, cleanupVerified: true, fixtureRecordsCreated: STEPS.length};
}
