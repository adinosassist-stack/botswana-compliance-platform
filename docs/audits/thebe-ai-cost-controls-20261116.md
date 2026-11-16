# Thebe Desk AI cost-control audit and protected implementation plan

Baseline: `347b182aab5e83c3036cf513c925291ff5badfc7` (2026-11-16). Read-only source review; **not** a production billing audit.

## Verified source behavior
- `cloudflare/src/general-ai-route.js` authenticates tenant/user, checks origin and CSRF, rejects workspace actions, and requires a per-tenant/user Cloudflare rate limiter before calling OpenAI.
- `cloudflare/src/general-ai-model-provider.js` is hard-pinned to `https://api.openai.com/v1/chat/completions`; it enforces HTTPS/host/path, 18-second timeout, bounded provider JSON, and max 1,200 output tokens. It returns **answer text only**, discarding provider token usage.
- `cloudflare/src/agent-openai-observation-adapter.js` has an independently approved-model gate and returns provider token usage when available. That does **not** establish a shared durable customer billing ledger.
- Production credentials, invoices, model usage and effective runtime flags were **not** inspected. Do not claim a live provider cost or active General AI route from this review.

## P0: instrumentation (private, default-off)
1. Capture provider, model, tenant, user, request ID, status, input/output/cached tokens, bounded retry count, and pricing-table version. Never log prompt bodies, credentials or personal data.
2. Write append-only, idempotent, tenant-scoped usage records. Retries and failed-but-billed requests must be accounted for; unknown usage must be marked **unknown**, never zero.
3. Estimate BWP costs from a versioned USD rate card and explicit FX assumption; distinguish estimate from invoiced charges. Reconcile aggregates with provider invoices.
4. Add daily and monthly per-tenant budget controls with atomic reservation/concurrency safety. Cloudflare rate limiting alone is not a monetary spending cap. Fail closed on unavailable budget ledger, without disrupting non-AI business functions.
5. Show owner dashboard totals, per-tier allowance, warning thresholds and explicit quota-exhausted response. Do not silently downgrade paid entitlements.

## P1: model-routing pilot
- Keep existing OpenAI behavior unchanged in production.
- Add a **private, disabled-by-default** DeepSeek candidate adapter, with strict host allowlist, isolated secret, no browser key, response size/time caps, no external tool execution and no automatic fallback.
- Only synthetic non-sensitive test data may leave staging until cross-border processing, retention, terms and tenant consent are approved.
- Benchmark at least 200 representative synthetic prompts against the incumbent model: task correctness, JSON validity, hallucinations, tool-call refusal, latency, errors and real token costs.
- Route only approved general non-sensitive tasks after independent `thusico` review. Never route payments, bank verification, sensitive personnel data or privileged Workspace Agent actions by default.

## Release acceptance
- Automated tests: tenant A cannot view/spend tenant B quota; concurrent requests cannot exceed budget; retries do not double-count; provider timeout records uncertainty; unknown usage is not free; secret never appears in response/logs; provider URL cannot be redirected.
- Validate exact-main CI, security, recovery and BF-07 gates; independent `thusico` approval and separately authorized deployment.
- No activation, D1 mutation, provider switch or production change is authorized by this document.

## Related launch blockers
- #1874 payment verification/activation; #2204 asset registration; #1934 authenticated AI chat network failure; #2413 legal disclosures; #2354 release coordination.
