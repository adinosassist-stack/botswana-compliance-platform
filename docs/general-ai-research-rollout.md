# Thebe AI — open-domain Q&A and grounded research rollout

Tracking: #2048. Status: **policy foundation only**, not connected to production or the dock.

The new pure module `cloudflare/src/general-ai-research-policy.js` classifies general, research and tenant-sensitive queries without granting permissions or executing actions. Citation metadata never claims verified research when no search was actually performed.

## Integration gates still required

1. Audit live dock request path and preserve existing voice, attachment and workspace behavior.
2. Introduce authenticated, rate-limited server-side model interface with tenant-bound retrieval; keep provider keys server-side.
3. Integrate a vetted web-search/retrieval provider with safe outbound fetching, redirect and DNS checks, source dates, provenance tracking and prompt-injection isolation. URL validation of *returned citations* is not a substitute for SSRF-safe outbound fetches.
4. Return real citations only when backed by retrieved sources; clearly disclose when browsing is unavailable.
5. Implement responsive citation UI in the unified charcoal Market/Workspace dock.
6. Cover cross-tenant auth, failure modes, freshness, citation grounding, model costs, accessibility, Setswana/English and mobile voice regression testing.
7. Stage with feature flag OFF by default; CI, independent review by thusico and release approval required before deployment.

No production deployment, credential changes, billing activation or autonomous business writes are authorized by this batch.

## Integration update (#2049)
- The authenticated `/api/ai/general` route is registered in `agentic-core.js`, with origin and CSRF enforcement.
- The existing owner Ask Thebe renderer can route to general AI **only** if a trusted server-rendered meta tag `<meta name="thebe-general-ai-enabled" content="true">` is present. Production has not been configured to emit this marker; existing Ask Thebe remains the default.
- Server adapter credentials: `OPENAI_API_KEY`, `THEBE_GENERAL_AI_MODEL`, and optional `BRAVE_SEARCH_API_KEY`. Never expose keys in HTML or logs.
- Backend gate: `THEBE_GENERAL_AI_ENABLED=true`. Search additionally requires `THEBE_GENERAL_AI_RESEARCH_ENABLED=true` and a Brave key.
- **Mandatory rate limit:** a configured Cloudflare `GENERAL_AI_RATE_LIMITER` binding exposing `limit({key})`, keyed by tenant and actor. Missing binding returns 503; exhausted budget returns 429.
- Search results currently use provider snippets, not independently fetched full documents. Citation links must be interpreted accordingly. Full-page source verification remains pending.
- Public Market dock is not wired to this route; do not expose tenant-authenticated service to anonymous visitors without a separate policy.
- CI, quota settings, model account billing, feature-flag provisioning, mobile/voice regressions, independent review and staging approval are still required. No feature activation or production deployment.
