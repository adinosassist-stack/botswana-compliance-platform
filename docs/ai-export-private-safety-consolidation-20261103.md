# Thebe Desk — Private AI export safety batch (unmounted)

This is a **reference and offline-qualification-only** consolidation of source PRs #1858, #1866, #1867, #1873 and #1877 onto current main. It preserves the existing, still-unmounted document renderer and UI; no production user-facing export workflow is activated.

## Included
- HTTP create/status/download fail closed unless the feature's enabled parameter is the literal boolean `true`; disabled paths cannot call injected identity, metadata or private object services.
- Private R2 candidate checks tenant-scoped object key format, mandatory future expiry, bounded size before reading, SHA-256 metadata and digest verification. It returns bytes rather than public links.
- D1 export-job metadata candidate and private-store composition; storage requires distinct private export and evidence bindings and explicit activation.
- Atomic per-tenant, per-actor, hourly export-generation quota candidate; default OFF.
- Staging-only retention candidate defaults to dry-run. No deletion possible without literal isolation setting, explicit enablement, three separate runtime confirmation gates, expiration grace and revalidation of metadata.
- Offline SQLite/D1 simulations, private R2 simulation, denial paths and source-specific CI plus combined regression qualification.

## Not included / still blocked
- No Cloudflare R2 or D1 production resources, database migration, real secret, HTTP route, Worker binding, cron, external deletion, real user export, or feature flag was enabled.
- Artifact signature validation and renderer long-token fixes (#1870 and #1860) remain separate unmerged candidates pending reviewed dependency and lockfile integration.
- Full live provider E2E, privacy review, credential scopes, R2 private-only verification, storage lifecycle, browser UX and on-platform export acceptance remain mandatory in issue #1868.
- No changes to existing production authorization, billing, customer subscriptions, or release governance.

## Merge gates
All required CI checks, new private-export-safety tests, and exact-head independent approval by thusico are required before merge. Do not close or supersede original source PRs until exact-path coverage, tests and successful protected merge have been verified. Even a merge does not authorize activating the feature.
