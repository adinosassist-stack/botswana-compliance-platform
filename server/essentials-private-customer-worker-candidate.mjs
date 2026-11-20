/**
 * C4 external-customer quotation host candidate.
 *
 * SOURCE ONLY. This file's DEFAULT Worker entry point is intentionally inert.
 * It does not register a customer IdP, provision credentials, call D1, mount
 * a public route, or authorize an actual customer invitation.
 *
 * Only an independently reviewed *future* private staging host can import the
 * named factory and supply independently verified customer ownership, genuine
 * OIDC/session and consent authorities. Do not use an employee/manager session.
 */
import {createEssentialsPrivateCustomerStagingHttpGateway}
 from "./essentials-private-customer-staging-http-gateway.mjs";

export const C4_PRIVATE_CUSTOMER_STAGING = Object.freeze({
 environment: "essentials-private-staging",
 accountId: "ddd23cab31928a4bb3d4998df9b26d1d",
 databaseName: "bw-essentials-customer-consent-private-staging",
 databaseId: "56f48000-9d89-47d5-a077-47dfe0825662",
 databaseBinding: "CUSTOMER_CONSENT_DB",
 publicRoutesAuthorized: false,
 defaultWorkerEnabled: false
});

const denialHeaders = Object.freeze({
 "content-type": "text/plain; charset=utf-8",
 "cache-control": "private, no-store, max-age=0",
 "x-content-type-options": "nosniff",
 "referrer-policy": "no-referrer",
 "x-robots-tag": "noindex, nofollow"
});
const denied = () => new Response("Not Found",{
 status: 404, headers: denialHeaders
});
const validDb = db => db !== null && typeof db === "object" &&
 typeof db.prepare === "function" && typeof db.batch === "function";
const validOrigin = value => {
 try {
  const url = new URL(value);
  return url.protocol === "https:" && url.origin === value &&
   !url.username && !url.password && !url.search && !url.hash;
 } catch { return false; }
};

/**
 * A source-level composition point, NOT a production or deployment switch.
 * The caller must independently attest its Cloudflare Access policy, host,
 * exact D1/Worker bindings, protected credentials and real customer ownership.
 * Passing functions here alone is NOT evidence those controls are present.
 *
 * Because the default export never invokes this factory, merely uploading or
 * deploying the candidate always returns an inert 404.
 */
export function createEssentialsPrivateCustomerWorkerCandidate({
 enabled = false,
 environment,
 expectedOrigin,
 database,
 journey,
 customerReviewBoundary,
 consentCommitter,
 authorizeProtectedHostRequest,
 enforceCustomerRateLimit,
 makeCspNonce
} = {}) {
 if (enabled !== true || environment !== C4_PRIVATE_CUSTOMER_STAGING.environment)
  throw Error("private_customer_worker_disabled");
 if (!validDb(database) || !validOrigin(expectedOrigin))
  throw Error("private_customer_worker_unconfigured");
 const gateway = createEssentialsPrivateCustomerStagingHttpGateway({
  enabled: true, environment, expectedOrigin, journey,
  customerReviewBoundary, consentCommitter,
  authorizeProtectedHostRequest, enforceCustomerRateLimit, makeCspNonce
 });
 return Object.freeze({
  async fetch(request, env) {
   // A real Worker must only have the isolated D1 bound as CUSTOMER_CONSENT_DB.
   // No runtime header, query parameter or env flag enables customer login.
   if (env?.[C4_PRIVATE_CUSTOMER_STAGING.databaseBinding] !== database)
    return denied();
   try {
    return await gateway.handleRequest(request);
   } catch {
    return denied();
   }
  }
 });
}

/** Deliberately deny EVERY request until a distinct approved host is created. */
export default Object.freeze({
 fetch() { return denied(); }
});
