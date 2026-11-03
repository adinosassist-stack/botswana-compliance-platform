# AI Dock export generation — atomic quota candidate

**Status: default-OFF, unmounted.** No production Cloudflare variable, D1 migration, R2 bucket, HTTP route or customer control is added here.

The export renderer can consume substantial memory and CPU. Before the render is started, the server must verify current session and workspace membership, validate the document export request, and reserve a bounded per-actor export allowance in durable storage.

`createAiExportD1Quota({db,enabled:true,clock,maxPerHour})` uses one atomic SQLite/D1 upsert with a composite tenant/actor/window key and `RETURNING` to avoid a separate check-then-write race. The fixed UTC-hour window resets naturally; the default cap is **6 admissions per actor per hour**, bounded to 1–20. Failed jobs still consume an admission; this deliberately prevents free expensive retry storms.

`createQuotaBoundedAiExportService({service,quota,enabled:true})` checks the canonical request policy before the quota admission, and invokes the existing authenticated export service only after admission. It keeps downloads separately authorized by the existing service, without charging additional generation quota. Any database error returns a generic denial and must never allow unmetered generation.

The review-only D1 table candidate is in `docs/ai-export-quota-schema-candidate.sql`. It is **not** in any migration runner and must not be applied to production without independent database and security review. Retention for old quota windows is out of scope.

The quota guard cannot substitute for a real authenticated session/actor resolver, concurrency limit on active render workers, global resource budget, message ACL revocation checks, strict file byte limits or abuse telemetry. It must be integrated and exercised in isolated staging before activating customer exports; see [launch gate #1868](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/1868).

Qualification: `node --experimental-sqlite --test tests/ai-export-atomic-quota.test.mjs`.
