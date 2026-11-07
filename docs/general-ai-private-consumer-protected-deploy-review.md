# General AI Queue consumer protected deployment — code review only

This PR adds a **new GitHub Actions workflow**, a deployable-but-**default-OFF** config, and static contract preflight for the already-created dedicated staging Queue and isolated replay D1. It does not itself dispatch a workflow, mint a token, deploy or enable anything.

Required exact source SHA is checked at the start of CI and again against current `main` **after** independent protected environment approval. `preflight` does offline unit/integration tests, a Wrangler dry-run and artifact provenance without Cloudflare writes. `deploy-private` requires the literal `DEPLOY_PRIVATE_GENERAL_AI_QUEUE`, protected `general-ai-private-staging` environment, nonempty dedicated `GENERAL_AI_QUEUE_STAGING_CLOUDFLARE_TOKEN`, exact reviewed account ID and a clean current-main check. It never reads the existing General AI staging credential or any production deploy token.

**DO NOT DISPATCH** until independent reviewer acceptance of the following:
- GitHub environment has `thusico` required, self-review prevention, main-only, no admin bypass. Environment must require independent release approval and cannot have been weakened.
- Dedicated token scopes and credential custody evaluated, especially if account-wide Queues Write / Workers Scripts Write could mutate production Workers or Queues. No reuse of production, billing, recovery or old General AI staging token.
- Actual target Worker is private and disabled, exact Queue and replay D1 IDs match, the replay schema is installed, logs/retries/budgets/retention reviewed.
- Explicit fresh owner + `thusico` approval for source-specific **deployment** (separate from schema install) and a separate subsequent permission for Queue message dispatch. PR code review alone does not authorize a deployment.
- No application traffic, provider invocations, authenticated session fixture, queue publishing, public route or AI flag activation.

Default-OFF runner cannot process Queue messages because `PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED=false`; it has no `APPROVED_SOURCE_SHA`. The protected deployment would nonetheless attach a Queue consumer trigger, which is itself an operational change and requires independent release approval. The eventual one-shot disabled-state 404/404/405 acceptance requires a **distinct** authenticated release action.
