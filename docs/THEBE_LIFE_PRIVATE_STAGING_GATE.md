# Private staging release — actual GitHub protection gate

This workflow is **read-only** and intentionally has no `environment:` deployment declaration: GitHub can automatically create nonexistent environments with unprotected defaults, so we refuse to create one implicitly.

1. An authorized repository owner creates `thebe-life-private-staging` manually.
2. Configure exactly one required-reviewer rule including `thusico`, enable prevent self-review, and choose **Selected branches and tags**, allowing only `main`. Production environments must remain untouched.
3. Provision a short-lived fine-grained GitHub token for **read-only** environment settings and branch policies, and save it as repository Actions secret `LIFE_STAGING_GITHUB_ENV_READ_TOKEN` scoped as narrowly as allowed.
4. Run manual workflow `Thebe Life private release gate (read only)` from reviewed `main`.
5. Only after gate SUCCESS, attach a separately reviewed deployment workflow to the pre-existing protected environment, use a dedicated least-privilege Cloudflare staging credential, and reconfirm exact commit SHA before upload.
6. Deploy only inert `bw-life-staging` Worker with `workers_dev=false`, `preview_urls=false`, no routes or custom domains. No production credentials, customer data, schema writes, household APIs, insurance or motshelo payments.

The verifier calls GitHub environment metadata and deployment branch policy list. If the GitHub token is missing, access is denied, thusico is absent, self-review is allowed or a branch other than main is permitted, the job **fails closed**. Workflow dry-run does not upload anything.

This gate does **not** prove Cloudflare token scope, runtime D1 mapping, production isolation or schema migration safety; those require separate checks.
