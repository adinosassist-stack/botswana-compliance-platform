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
