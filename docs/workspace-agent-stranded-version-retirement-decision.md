# Workspace Agent: proposed retirement of stranded, undeployed Worker version

**Status: analysis only. No deletion or Cloudflare write authorized.**

The protected read-only audit [#43775130470](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/43775130470) established:

- Staging Cloudflare account: `b11d872b2660e76ca66323023b45b3ab` only.
- Worker: `bw-workspace-agent-staging`.
- Exact pinned inert version: `64d9bae9-2ea3-40c1-9a26-83cea97ad71c`, 100% deployed.
- Divergent unsafe latest upload: `9ba41e62-9efc-49c5-9d4e-d667057e43fb`, 0% deployed.
- Pinned version has eight expected plain-text bindings and advisory flag `false`; no D1 or session secret.
- Latest upload and script settings contain `SESSION_SECRET`, a dedicated D1 binding and advisory flag `true`.
- Read-only inert diagnostics [#43776934405](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/43776934405) passed pinned runtime and isolation but properly blocked **full staging qualification** because the surfaces diverge.

## Candidate operation, not approved

Cloudflare exposes a version-scoped Delete Worker Version endpoint,
`DELETE /accounts/{account_id}/workers/workers/{worker_id}/versions/{version_id}`,
separate from the deployment and D1 endpoints. Removing **only the exact undeployed candidate**
could eliminate the conflicting latest upload *if and only if* full version history proves that
pinned and candidate are the only two existing versions, and Cloudflare permits the operation.
This outcome must **not** be assumed or described as proven until post-operation read-only checks pass.

Never delete the pinned inert version; never delete or modify the D1 database; never delete a
deployment, Worker, route, schedule, secret independently, or any production resource.
There is **no DELETE request or write token** in the workflow added by this PR.

The candidate is a version containing a secret binding. Version deletion may be
irreversible and could remove unique version-bound code/configuration or secret lineage.
Do not execute without explicit owner acceptance of this exact destructive scope, confirmation
that archival/retention obligations are addressed **without exporting secret values**, a
separately reviewed write-capable implementation, and independent `thusico` protected approval.

## Required independent preflight

The companion read-only workflow requires a fresh exact-main SHA and independent
`workspace-agent-private-staging` approval from `thusico`. It blocks unless:

1. Complete version list has exactly the pinned and candidate IDs, with candidate newer.
2. Candidate remains the latest upload and **is not** in the 100% deployed allocation.
3. Pinned retains all eight exact inert bindings; candidate and script settings match
   the known nine plain-text, D1, session-secret *identity-only* configuration.
4. The isolated account has no zones; Worker has no public URLs/previews, domains, schedules.
5. Only the expected Worker exists, and the dedicated staging D1 is empty.
6. Read-only provenance is consistent; no unexplained version drift or additional uploads.

The preflight must be re-run immediately before **any** separately authorized write.
Any drift, API error, unknown metadata, failure or additional upload is a hard stop.

## Proposed post-operation checks (only if separately authorized)

Read back complete version list, latest version, pinned version, script settings, deployment,
account zones, subdomain/preview, schedules, custom domains, and the dedicated empty D1.
The exact pinned version must remain deployed at 100%, and latest and script settings must
match its eight disabled plain-text variables. If Cloudflare keeps stale script settings
or refuses deletion due to version history, stop and keep full staging blocked; never fall
back to deployment changes, secret export, data deletion or bypassing CI.

Any future write must be in a **separate PR/workflow**, not retrofitted into this
read-only audit or performed with a general-purpose production credential.
Owner consent and independent `thusico` protected approval are separate gates.
