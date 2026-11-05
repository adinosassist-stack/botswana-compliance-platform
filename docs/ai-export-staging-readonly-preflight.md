# Thebe Desk AI Dock: export storage staging preflight

The implementation is **not wired into the deployed Worker**. It is a reviewed candidate for an explicitly authorized, read-only inspection, not proof of production readiness.

## Why this is needed

- The public Cloudflare Worker currently binds `DB` and the `EVIDENCE` R2 bucket, but it does **not** provision a distinct AI-export R2 bucket.
- Candidate D1 schema `docs/ai-export-d1-schema-candidate.sql` is not an applied production migration.
- `server/ai-document-renderer.js` uses dynamically loaded rendering packages; customer exports remain OFF.
- The staging preflight checks only a dedicated `EXPORTS` bucket via an R2 HEAD request for a non-customer sentinel and D1 `sqlite_master` table metadata.
- Successful HEAD of a missing sentinel **does not** prove put permission, object integrity, tenant authorization, retention cleanup, or end-to-end download. The preflight always reports `productionReady:false`.

## Safety requirements

1. Bind a separately approved, **private** `EXPORTS` R2 bucket in a strictly isolated staging environment. Never point `EXPORTS` at `EVIDENCE`.
2. Independently authorize the read-only inspection. Call `inspectAiExportStaging({env,authorized:true})` only when `env.APP_ENV === 'staging'`.
3. Only query schema metadata and issue HEAD for `ai-exports/_preflight_/missing-object`. No object writes/deletes or customer reads.
4. Do not register any route, production script, scheduler, or flag that runs this inspector automatically.
5. Record inspection evidence and errors, then separately qualify exact schema and isolated staging writes/reads before proposing activation. Follow the [AI Dock export launch gate](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/1868).

Run `node --test tests/ai-export-staging-readonly.test.mjs` for its local, mock-only tests.


## 5 November 2026 staging infrastructure inventory — read-only observation

- Dedicated private R2 bucket `bw-ai-exports-staging` was created and verified with `r2.dev` disabled and zero custom public domains. Bucket existence is **not** file-integrity or permission qualification.
- Read-only `sqlite_master` queries against isolated `bw-general-ai-auth-staging`, `bw-conversation-staging`, `bw-billing-staging` and `bw-compliance-os-pop-staging` found **no** `ai_document_export_jobs` metadata table. No D1 writes were made.
- The proposed metadata DDL remains unmounted and unapplied; do **not** apply it to production or reuse POP, billing or General AI auth D1 without a separately reviewed isolation decision.
- The additional `tests/ai-export-staging-schema-offline.test.py` creates the candidate schema in **local in-memory SQLite only** and checks supported formats, expiration constraints, queued/completed state requirements and indexes. Green tests do not establish Cloudflare D1 compatibility, application tenant authorization, isolated E2E behavior or production readiness.

**Next activation gates:** choose and independently approve an isolated export metadata staging D1; pin an exact schema digest; qualify an explicitly authorized staging-only schema application and private Worker `EXPORTS` binding; verify synthetic file write/read/hash/expiry/cleanup in private staging and tenant isolation under reviewer oversight. Keep public routes, production flags and payment activation disabled until separately approved.


## Exact-target schema qualification batch (5 November 2026)

A new **empty** Cloudflare D1 metadata database is reserved **solely for AI-export staging**:

| Property | Required state |
| --- | --- |
| D1 | `bw-ai-exports-staging` |
| Exact staging UUID | `ee6ddc6b-9de7-43f5-97e8-39442f1d1135` |
| Cloudflare account | `ddd23cab31928a4bb3d4998df9b26d1d` |
| R2 | private `bw-ai-exports-staging` with public domains disabled |
| Production D1 forbidden target | `8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce` |
| Application DDL applied | **No** |
| Worker bindings deployed | **No** |

`scripts/qualify-ai-export-staging-schema-offline.mjs` is a **no-network, no-write** inspection tool. It computes SHA-256 over the exact bytes of the proposed `docs/ai-export-d1-schema-candidate.sql`, refuses mismatched or non-staging targets, and refuses extra SQL statements or write operations. The output is **REVIEW_ONLY_DO_NOT_EXECUTE** and `approvedToApply=false` even when checks pass. Negative tests run in `tests/ai-export-staging-schema-plan.test.mjs` alongside isolated SQLite tests in CI.

**Separately required** before any staging DDL: independent `thusico` review of the exact SQL digest and isolation target; dedicated staging-only credentials with no production D1 write scope; a recorded empty schema inventory and rollback/retention plan; and a protected execution mechanism that can prove exact current reviewed source SHA. Applying DDL to this D1 is a **different action** from creating an empty database. Never apply these statements to `bw-compliance-os` or re-use a billing, POP, conversation or General AI auth staging database. No customer files or private export objects should be written until subsequent synthetic E2E test authorization.
