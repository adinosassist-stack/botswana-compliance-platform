# Thebe Desk AI-export staging schema review bundle

**Review only — no migration or object write authority.**

Target staging-only database: `bw-ai-exports-staging`, UUID `ee6ddc6b-9de7-43f5-97e8-39442f1d1135`. Its dedicated private R2 bucket has the same name. Production D1 UUID `8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce` is an explicitly excluded target.

The `AI export isolated staging schema review bundle` workflow generates an artifact with (1) exact reviewed candidate SQL, (2) `SOURCE_SHA.txt`, (3) JSON manifest with SHA-256 of candidate DDL and default-deny status, and (4) a SHA256SUMS verification file. It runs local tests and *never* imports cloud credentials, connects to Cloudflare, issues D1 queries, writes R2 objects, or applies SQL.

To generate an artifact after a protected merge, manually dispatch on **current main** with input `expected_sha` equal to the exact current main commit. For pull requests, an offline artifact is generated for the CI commit only. This is not a staging deploy.

## Required separate authorization before staging DDL

1. Verify the staged D1 UUID matches the exact target above and is distinct from production, POP, billing, conversation and General AI auth databases.
2. Verify the reviewed source SHA and SQL SHA-256 against the retained bundle; verify the destination database is empty except for Cloudflare-internal tables.
3. Obtain independently recorded `thusico` review for a separately protected *staging-only migration* workflow. This existing review-bundle workflow **must not** be reinterpreted as migration approval.
4. Establish rollback/export evidence, dedicated least-privilege staging credential, no public Worker route and a gate that refuses an unreviewed SHA or unexpected D1 objects.
5. Only after all of the above, separately consider applying the candidate DDL to **this staging database alone**; then validate private synthetic file round-trip, content hash, tenant authorization, expiry, cleanup and no R2 public access. There is no production activation in this protocol.

Production General AI, AI exports and POP upload flags remain false.


## Staging pre-apply review gate

The offline `scripts/inspect-ai-export-staging-preapply.mjs` validates a proposed review package against a pinned source SHA, candidate schema digest, isolated database ID, unchanged schema inventory, and distinct current owner and reviewer records. Its tests refuse stale records, incorrect database identity and extra SQL. Even valid-looking inputs result in `approvedToApply=false` and `remoteMutations=0`: this helper never executes database operations. A future separate workflow would require independent authenticated reviews, restricted staging credentials, protected environment settings and a rollback plan. No production changes are authorized.
