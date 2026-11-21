# Manager private staging activation: consolidated protected gates

**Status:** code-only review and historical read-only inventory. **NO remote
execution authorized** by this PR, this document, the offline qualification
workflow, or the earlier candidate-upload approvals. Tracking issue #2599.

## Pinned exact scope (21 November 2026)

- Reviewed main SHA: `96645f46d670c46e05dbad3af1ae846172d32cc1`; a changed main requires fresh provenance.
- Isolated account `f585813fa376f7c71c7d4a79254168fa`, zone `thebedesk-test.win` ID
  `5cf26ad83f8d5a5fb6ef97ce516b932b`.
- Candidate Worker `bw-manager-invitations-functional-private-staging`
  (ID `a83242df903d4fb7b4ad5ea9e5a1a509`), version `b4c61970-0a0b-4c63-bc37-1b067e215a6d`.
- Baseline version `cc509d3c-75d4-450a-acb1-e2ecdcb245d7`, remain available as inert rollback reference.
- Candidate artifact Worker SHA-256 `9a9496e2481a03db0c9f1dcaccc89a450d5048f1bad3523ab6454b240a0bc75e`,
  278-asset manifest SHA-256 `2b06f615812022db4a5d2ace49bce433cb1929d25ebde37228dc88d5325f3f6e`.
- Synthetic D1 `1a2fc702-2592-491c-9f55-80e032a56dd8`, 13 tables at inventory check;
  no production bindings.
- Exact test host `manager-staging.thebedesk-test.win`. Access application
  `fa020bbc-0407-40f0-873e-e79537dcf021`, single-allow policy
  `6fc750df-7e40-492f-845d-47e6e5deab0b`, authorized tester
  `banabothem@yahoo.com`, default-deny and pinned IdP.
- Current inventory: two undeployed versions, zero deployments, zero
  Worker routes, zero Worker custom domains, zero DNS records for the test host;
  workers.dev and previews disabled.

## What this batch actually implements

- `scripts/manager-private-activation-qualification.py`: an **offline-only**
  snapshot validator for immutable account/zone/Worker/candidate/D1, Access
  policy, single tester, exact candidate bindings and no ingress; deliberately
  denies a changed main SHA and carries no network or write capability.
- `tests/test_manager_private_activation_qualification.py`: reject wrong
  account, D1, candidate, new versions, deployments, routes, DNS, Access
  bypass, wrong flags, leaked secrets, missing dedicated secret binding,
  production dependencies and stale approvals. Separate approval phase markers.
- `.github/workflows/manager-private-activation-qualification.yml`:
  runs these offline tests on the PR and by manual request with
  `contents:read` only. No Cloudflare credentials or environment secrets.
- Snapshot fixture documents a historical observation, **never** fresh
  execution authority. Passing CI does not prove live Access interception,
  a recovery bookmark or a functional Manager login.

## Separate protected execution implementation STILL required

Before any remote write, a later independently reviewed PR must implement
an execution runner that **fetches live GitHub comment authors and current
main**, verifies actual Cloudflare state and refuses stale evidence or unknown
API responses. It must use a dedicated protected environment with
`thusico` as required reviewer, self-review prevention, no admin bypass,
`main`-only restrictions, minimum-privilege secrets and audit redaction.

**Phase 1: deploy pinned candidate without ingress.** Separate exact-version
owner and independent `thusico` comment approvals must include
`APPROVE_MANAGER_PRIVATE_DEPLOY_NO_INGRESS`, the exact SHA,
Worker/artifact hashes, immutable D1/account and
`NO_PUBLIC_INGRESS_OR_PRODUCTION_CHANGES`. Deploy version `b4c61970-0a0b-4c63-bc37-1b067e215a6d`
only after fresh D1/Access/rollback and configuration checks. Do not add
DNS, routes, custom domains, workers.dev, previews or public activation.

**Phase 2: introduce exact Access-protected test hostname.** Require new,
independent approvals including
`APPROVE_MANAGER_PRIVATE_INGRESS_TEST_ONLY`. Establish a private,
non-production origin only after independently verifying Cloudflare Access
is in front of the Worker. Test seven unauthenticated paths and non-allowlisted
identity denial **before** serving application responses. If enforcement
cannot be verified, stop and roll back only the new test ingress under the
approved runbook. No wildcard route or `thebedesk.com` production zone.

**Phase 3: synthetic functional qualification.** Owner invitation, token
single-use/replay denial, manager login, assigned-branch dashboard,
cross-tenant and unassigned-branch denial, grant revocation, suspension and
D1 time-travel recovery/teardown. Redact all tokens/cookies and capture
independently reviewed evidence. No real customer data.

## Safety decisions

- Earlier owner comment #7066670095 and independent comment #7066632566
  approved **candidate upload only**. They cannot authorize either phase.
- No live ingress means no browser smoke-test claim. Do not announce private
  login as active.
- A freshly re-verified snapshot, actual Access-negative probes, D1 recovery,
  approved execution mechanism and independent release decisions are all
  outstanding. The successful version upload alone is not enough.
