# Manager Invitations — Standalone Cloudflare Account Transition (2026-11-18)

## Confirmed isolation

The owner created a third Cloudflare account, returned by `GET /accounts` as **standalone Free account**:

- **New manager-only account:** `f585813fa376f7c71c7d4a79254168fa`
- **New synthetic-only D1:** `bw-manager-invitations-synthetic-staging`, UUID `1a2fc702-2592-491c-9f55-80e032a56dd8` — created with D1 read replication disabled.
- Cloudflare read-only inventory confirmed **zero Workers, zero scripts** in new account; no D1 records existed before creating this database.
- **Production account:** `ddd23cab31928a4bb3d4998df9b26d1d` — unchanged.
- **Other Workspace Agent staging account:** `b11d872b2660e76ca66323023b45b3ab` — unchanged.
- **Legacy manager D1:** `518a9e33-b2ba-4204-ac52-aae4150a7b52` in production account. Do **not** carry this binding across accounts.

## Source-only changes in this PR

`cloudflare/wrangler.manager-standalone-account-staging.toml` is a new **review-only** config, preserving exact Worker name, flags, static assets options and immutable compiled Worker source expectations, with only explicit new account and fresh synthetic D1 mapping. All manager activation flags, AI, POP uploads, payment provider, workers.dev, preview URLs and routes are disabled. No secrets are specified.

Retire the existing `version-only` job by forcing `if: false` in the old upload workflow. The old job targets the old Cloudflare account and `wrangler versions upload` cannot initialize a never-created Worker. Keep its PR-only offline tests operational, adding regression tests for this separation.

## Gates before execution (not satisfied by this PR)

1. **Independent `thusico` review** of new account, D1, exact source/config SHA, artifacts and new private ingress path; only after review pin these precise new values in a **separate** protected workflow.
2. **Provision synthetic schema and read-only recovery proof** in the *new* D1. It is empty at creation. Do not import customer data or old production data; copy reviewed schema/migrations only if separately authorized.
3. **Private Access / authentication.** In the new account, `GET /accounts/{account_id}/access/apps` was forbidden to the current connector; zero domain/zone ingress is available in new account. The existing Access app `7934753d-0188-4796-9288-bfd99d3be791` in the production account cannot be assumed to protect the new Worker. No routes or previews should be enabled until new account isolation + private login policy are confirmed.
4. **Dedicated account-scoped Cloudflare token**, scoped only to the new account; its value belongs exclusively in GitHub environment protected secrets, never Git, comments or chat. **Never reuse** the old GitHub secret `MANAGER_STAGING_VERSION_CLOUDFLARE_TOKEN` without proving its exact account scope; rotate/retire old credentials separately when appropriate.
5. **Approved first-version upload mechanism.** The direct API creation + static asset upload + undeployed first version source is present but not wired to an executable workflow. Previous attempt to create a live-capable workflow was blocked by integration safety checks. Do not bypass the block or dispatch the retired Wrangler job.
6. **Read-only postflight:** exact single undeployed version, no deployments, workers.dev, previews, routes, domains, DNS, cross-account resources or unexpected Access policy. Then separate approved manager-invitation functional tests; no production activation.

**No manager Worker created/deployed, no public access, no customer data, no old-account changes from this transition.** Tracking: issue #2599.
