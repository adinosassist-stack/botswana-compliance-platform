# Workspace Agent — protected one-shot private live qualification

Scope: issue #2433. This workflow is **not a production Agent release**. It is one synthetic, private Cloudflare Worker + D1 qualification and audited rollback. No public Worker route, custom domain, workers.dev or preview URL is permitted; production and customer accounts remain out of scope.

## Mandatory prerequisites (fail closed)

1. Merge this PR only after independent `thusico` source review and required CI. Confirm the exact *new* `main` SHA. The previous protected preflight run #7 used `7c1bc8cb5dc0a98114511cf11e31d0473487740d`; **it cannot authorize a run on a later main SHA.**
2. From the owner account (not `thusico`), dispatch `Workspace Agent no-route inventory preflight` on the new exact `main`, and have `thusico` independently approve that **read-only** run. Record its successful run ID.
3. Configure environment `workspace-agent-private-staging` to require only independent `thusico` review, prevent self-review and restrict to `main`. Supply secret name `WORKSPACE_AGENT_STAGING_QUALIFICATION_CLOUDFLARE_TOKEN` there, with scoped permission to read Workers/deployments/settings/schedules/versions, read D1 metadata, read all necessary zone routes/domains, upload/deploy/delete **only the isolated staging Worker and temporary caller**, manage the caller's cron and Tail sessions; do not reuse the production token. Audit Cloudflare's actually supported token resource restrictions rather than assuming account-wide Workers permissions can be narrowed to a particular script. Keep the credential value out of issues, PRs and logs.
4. Owner dispatches `Workspace Agent protected private live qualification` on `main` with the exact SHA, successful **same-SHA** preflight run ID, and confirmation `QUALIFY_PRIVATE_WORKSPACE_AGENT_ONCE`. `thusico` separately reviews that protected **live** job. Owner never self-approves; independent review of this PR is not a substitute for the environment approval.
5. Do not run if any target D1 table exists, any caller is present, any public route exists or the target is not precisely pinned to the inert version. If Cloudflare permissions cannot enumerate all relevant route inventory, treat the preflight as incomplete. A successful static CI run is not live evidence.

## Bounded runtime behavior

- Check exact current `main` immediately before remote writes, using the protected GitHub Actions job. Use an isolated short-lived, randomly generated `SESSION_SECRET` to create only synthetic owner/manager/denied-role and expired/revoked sessions.
- Upload a temporary target **version only** with `APP_ENV=staging`, the advisory flag enabled only for the private qualification version, and a binding to the dedicated synthetic D1. Deploy it with no inbound routes. The permanent inert version stays pinned as the rollback reference.
- Upload a temporary scheduled-only caller with a private service binding to the target, the same synthetic D1 and a short-lived secret. Verify `workers.dev` and previews are disabled before scheduling. Open Cloudflare Tail before installing the one-minute window. Redact all session token and secret content.
- Run the exact seven authentication scenarios on both read-only advisory endpoints. Require status parity, tenant isolation, `Cache-Control: no-store`, denial of POST and unrelated paths, no changes to fixture data, and the `fixturesRemoved=true` receipt. Missing or malformed evidence fails the job.
- In a `finally` block, remove the cron, stop Tail, delete only the temporary caller created by this run, restore the pinned inert version, and re-inventory the Worker and dedicated empty D1. An independent `if: always()` job step checks rollback again. If cleanup fails, the workflow fails and requires immediate operator incident handling.

## Important limitations

- **No live run has been performed by this PR.** CI locally verifies guards and scenarios; it does not qualify actual Cloudflare execution until independently approved and dispatched.
- Remote Cron delivery and Tail availability can fail or exceed the bounded observation window. Treat missing receipt as failure, and verify rollback rather than declaring success.
- Uploading a target version may leave a non-deployed historical Worker version with an ephemeral synthetic secret. It must not receive traffic; consider separate, approved version-retention and secret-rotation cleanup if Cloudflare retains it. The actual inert deployment and zero active secrets/bindings must be verified.
- The scope does not include Node/PostgreSQL parity, public browser sessions, tenant switching in the browser, payments, production release or Agent activation. These require separate approvals and evidence.
- If the job is cancelled, the runner crashes or Cloudflare becomes unreachable before `finally`, the fallback `if: always()` check is **not a substitute for a protected manual rollback**. Stop further staging writes, inspect only the dedicated resource IDs and restore the pinned inert version under independent approval. Do not delete production resources.
