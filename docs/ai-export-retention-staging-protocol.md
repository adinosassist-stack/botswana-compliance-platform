# AI Dock export retention — isolated staging qualification

**Review-only implementation.** This is an unmounted helper, not a scheduled job, production migration or authorized cleanup run.

## Purpose

Expiry-aware private reads prevent serving old AI exports but do not physically remove expired objects from Cloudflare R2. The staging retention helper makes cleanup separately testable without touching existing evidence storage or enabling customer downloads.

## Required safety conditions

- The constructor only enables when `enabled === true`, `environment === 'isolated-staging'`, a metadata adapter supports `listExpired` and `find`, and the dedicated private export R2 binding differs from the evidence R2 binding.
- **Default behavior is read-only.** It scans at most 25 rows and rechecks each row with tenant, actor and job IDs before considering any object.
- Files must have `status === 'completed'`, an exact `ai-exports/<tenantId>/<jobId>` key, and must have expired **at least one additional hour ago** (to avoid fresh-expiry races).
- Even in an isolated staging context, delete requires `run({dryRun:false, approval:true, confirmation:'DELETE_EXPIRED_EXPORT_OBJECTS_IN_STAGING'})`. Incorrect strings, false booleans or default arguments never delete.
- The only destructive call is `exportBinding.delete(key)`; no wildcard, prefix delete, bucket enumeration, SQL mutation, evidence store access, or customer-data logging.
- The returned output contains **aggregate counts only**, not tenant IDs, object keys, document text or exception messages. Partial failures do not falsely report success.
- This helper does not run in a public Worker, customer route, scheduled process, staging environment, or production environment until separately configured and authorized.

## Still required before rollout

Independent reviewers must inspect object retention obligations, lifecycle timelines, orphan files from partial writes, schema migration state, delete permission scoping, storage logging and an isolated staging write/read/delete rehearsal. Recheck ownership and content authorization at the HTTP download boundary separately. This staging-only helper does **not** support production deletion and is not an authorization to remove existing customer data.

See [AI export launch gate #1868](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/1868).

Run tests with `node --test tests/ai-export-staging-retention.test.mjs`.
