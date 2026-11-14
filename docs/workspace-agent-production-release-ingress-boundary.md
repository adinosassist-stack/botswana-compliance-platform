# Workspace Agent — earliest denial at the actual production Worker entry

**Code-only security gate; no Cloudflare upload, Worker deploy, D1/PG migration, route/DNS, Access app or activation.**

The production Wrangler configuration uses `cloudflare/src/release-governance-entry.js` as its true Worker entrypoint. PR #2439 added the default-deny Workspace Agent API guard at the first operation of the nested Agentic entrypoint, but the release-governance wrapper was still able to run the conversion-funnel handler before delegating to Agentic. A future conversion path could accidentally handle an identity or task URL first.

This PR repeats the existing `denyUnqualifiedWorkspaceAgentApi({env,request,logicalPath})` check at the earliest release-governance `fetch` boundary, **before** conversion funnels, registration, surface rewrites, downstream Agent handlers, or database access. The inner Agentic guards remain in place as defense in depth.

Both exact GET-only advisory endpoints are denied with no-store, nosniff 404 outside an explicitly selected private staging environment, feature flag and pinned HTTPS host. Logical-path tunnels remain rejected; other paths continue to use their preexisting route chains.

### Test evidence

`tests/workspace-agent-production-entry-early-denial.test.mjs` calls the actual exported `release-governance-entry.js` Worker `fetch` directly. Its poisoned synthetic environment throws if the code attempts to read session secrets, DB/payment fields or registration configuration. It checks all methods on both endpoints, production even with a mistakenly set feature flag, host/flag/scheme mismatch, and tunneled paths. It also verifies that an allowed staging hostname is only a candidate for further signed-cookie authentication, **not** proof of approval.

The offline staging qualification source fingerprint now includes an explicit release-level ordering check. Weakening/removing the earliest guard fails qualification; `readyForStagingDeployment` and `productionActivationAuthorized` always remain false.

**Outstanding:** PR #2437's read-only result hardening still requires independent `thusico` approval. Issue #2433's staging hostname/Access policy remains unresolved. Neither this PR nor passing CI authorizes provisioning, publishing, staging browser access or production deployment.
