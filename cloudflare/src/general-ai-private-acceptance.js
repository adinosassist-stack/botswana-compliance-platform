/** Offline-first service-binding acceptance contract for private General AI staging.
 * This module is deliberately NOT a Worker entrypoint and has no trigger, route,
 * service binding deployment or credential access. It may be invoked later only
 * by an independently approved and authenticated private test runner.
 */
const EXPECTED_ORIGIN = "https://ai-staging.thebedesk.com";
const ALLOWED_STATUSES = Object.freeze({
  disabled: 404,
  unrelated: 404,
  method: 405
});
function assertService(service) {
  if (!service || typeof service.fetch !== "function") throw Error("private_service_binding_required");
}
function assertOrigin(origin) {
  let url;
  try {url = new URL(origin)} catch {throw Error("reviewed_staging_origin_required")}
  if (url.href !== EXPECTED_ORIGIN + "/") throw Error("reviewed_staging_origin_required");
  return url.origin;
}
function requestFor(origin, path, method = "POST") {
  return new Request(origin + path, {
    method,
    headers: {"origin": origin, "content-type": "application/json", "x-thebe-qualification": "offline-private-acceptance"}
  });
}
async function invoke(service, request) {
  const result = await service.fetch(request);
  if (!(result instanceof Response)) throw Error("private_service_invalid_response");
  // Response bodies can contain sensitive error details; never read or log them.
  return result.status;
}
/** Only exercises no-credential, no-provider negative paths while feature is OFF.
 * Fail closed if unexpectedly enabled; never send a session cookie or real prompt.
 */
export async function verifyPrivateAiDisabled({ service, origin = EXPECTED_ORIGIN } = {}) {
  assertService(service);
  const reviewedOrigin = assertOrigin(origin);
  const scenarios = [
    {name: "disabled", path: "/api/ai/general", method: "POST"},
    {name: "unrelated", path: "/api/auth/register", method: "POST"},
    {name: "method", path: "/api/ai/general", method: "GET"}
  ];
  const outcomes = [];
  for (const scenario of scenarios) {
    const status = await invoke(service, requestFor(reviewedOrigin, scenario.path, scenario.method));
    outcomes.push({name: scenario.name, status});
    if (status !== ALLOWED_STATUSES[scenario.name]) {
      throw Error("private_staging_boundary_mismatch:" + scenario.name);
    }
  }
  return {ok: true, scope: "private-disabled-negative-paths-only", origin: reviewedOrigin,
    tested: outcomes.length, outcomes};
}
