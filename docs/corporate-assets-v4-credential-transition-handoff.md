# Corporate Assets staging — v4 code-continuity and credential-transition handoff

**Status: evidence preparation, not deployment authorization.**

## Verified Cloudflare metadata (2026-11-15)

The private Worker `bw-corporate-assets-staging` has three relevant immutable
versions: active v2 `5497120e-4ae6-4665-b96f-4b040d32a249`, dormant v3
`983daaea-1e6b-4359-9994-0b792578008b`, and dormant credential-candidate
v4 `dc708a58-4da1-4af5-a10a-17ace5ea25fa`.

Their *Cloudflare Worker script ETags* are equal:
`cf696a00607c2b899fefda9fa0277d3ba75b6fe53e64fd40782dee5e533b0198`.
This is authenticated Cloudflare-reported **script continuity between versions**,
not independent source-byte equality to reviewed GitHub `main`.

All three show historical source marker
`062ef3ea4c598d38a56e15dba1691c30aa4e5c72`.
The deployed v2 credential bindings `SESSION_SECRET` and
`AUDIT_INTEGRITY_SECRET` still have unsafe `plain_text` **types**.
Dormant v3/v4 have `secret_text` **types**. Binding types are not proof of
compatible or identical secret values.

Private staging v2 remains at 100% with isolated D1
`e19f09de-3bb9-4021-b4f8-44df04c8aaa8`; Assets activation and writes
remain `false`, with no `workers.dev` or preview URLs. The independently
reviewed protected [GET-only run #43709049730](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/43709049730)
passed the new v4 metadata step and then **correctly failed** at the existing
`active_version_credential_safety_not_verified` release gate.

## New protected transition evidence

`scripts/corporate-assets-v4-credential-transition-evidence.mjs`
performs only authenticated **GET** reads of v2/v3/v4 immutable metadata
and the deployment inventory, alongside the separate private-exposure
attestation. It requires equal 64-hex Cloudflare script ETags, isolated
D1 bindings, inactive flags, no candidate deployment, active v2 at 100%,
and expected credential **types**. It returns only limited metadata and
denial flags, never credential values or full bindings. Run inside
`corporate-assets-protected-provenance-preflight.yml` on exact `main`,
subject to independent `thusico` protected-environment approval.

A passing code-continuity check still leaves all of these **unverified**:

- Exact compiled GitHub `main` bytes linked to the Cloudflare version.
- Acceptance of freshly rotated staging secrets by pre-existing sessions,
  authentication paths and service-to-service access, including whether
  reauthentication is mandatory.
- Audit-integrity signature/chain continuity and rotation recovery,
  including safe rollback behavior; do not assume old proofs remain valid.
- An isolated private functional smoke test and denial-path checks.
- A safely reversible private staging deployment candidate and
  independently approved rollback plan.
- Explicit **new owner deployment authorization** and separate
  independent `thusico` approval. Prior authorization covered
  **creating one undeployed v4**, not deploying it.

The old protected [source upload run #42719464957](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/42719464957)
remains awaiting reviewer approval on stale source. Do not approve or
mistake that run for an exact-current-main qualification.

## Release decision

**No staging deployment is approved.** The safe next path is to qualify
artifact lineage from reviewed exact-current-main, define and test
the credential transition and rollback acceptance in isolation, and
obtain new owner and independent reviewer staging-deployment approvals.
The existing fail-closed active-v2 gate remains in place. Do not deploy
v4 simply to make the old v2 credential warning disappear.

No additional version, secret changes, D1 writes, public routes,
preview enablement, traffic shift or production changes are part of
this document and PR.
