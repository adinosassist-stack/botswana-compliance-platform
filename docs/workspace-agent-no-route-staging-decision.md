# Workspace Agent private staging — no-route decision candidate

**Status: proposal only. No resource creation, deployment, route, custom domain, workers.dev, preview URL, database operation, flag enablement or approval.**

Related gate: [issue #2433](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/2433). The owner and independent reviewer `thusico` must approve the exact-main source and a separately qualified infrastructure plan before provisioning. An issue comment reading “Approve_” by itself does not identify a specific release SHA, protected environment or proposed hostname admission policy.

## Decision: split staging into two separately controlled phases

**Phase A — offline/no-route preparation (candidate in this PR).** Propose a new, reserved `bw-workspace-agent-staging` Worker and an identically named, **new** synthetic-only D1. Neither currently exists in the account listing. Set `workers_dev=false`, `preview_urls=false`, no routes, no custom domains, no hostname, `APP_ENV=staging` and `WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED=false`. This candidate is **not created or deployed**; a static check merely confirms the shape of a draft, and it always returns `readyForStagingDeployment=false`. The source may be dry-run built locally only after separate code review. Network browser authentication is **not possible** in this phase because there is deliberately no inbound route.

**Phase B — optional authenticated browser qualification (not authorized).** The existing preview code requires a real HTTPS `.thebedesk.com` staging hostname, explicitly pinned in `WORKSPACE_AGENT_ADVISORY_STAGING_HOST`, a staging environment, a verified owner/manager session, and an opt-in flag. A private Cloudflare Access policy on a DNS-resolvable staging hostname might prevent unauthorized access, but it remains a routed hostname and conflicts with the existing **no-public-routes** rule. Do not create DNS, a route, Access application or custom hostname unless owner and `thusico` separately approve an explicit narrow exception, exact source, identity assurance, network-denial tests and rollback. Alternatively, separately review a private-only, nonpublic preview architecture compatible with the runtime gate. There is no implied preference or permission to select either option.

## Read-only inventory scope

`docs/workspace-agent-no-route-staging-plan.json` records six Worker names and 17 D1 names returned by the Cloudflare list APIs on 14 November 2026; the snapshot is not an independently attested assertion about active routes, bindings, secret permissions, Access policies, production traffic or what exists later. The recorded names are included **solely** to test non-reuse of known resources. The candidate resource names are proposals, not live IDs or allocations. A fresh independent read-only inventory must be obtained at protected preflight time.

## Automated checks

`scripts/workspace-agent-no-route-staging-plan.mjs` checks the draft schema, proposed resource-name uniqueness against the supplied snapshot, account reference, empty routes/custom domains, disabled workers.dev/preview URLs, absent DB binding, synthetic-only intent, disabled Agent flag, absent hostname and no claimed approval IDs or exact-source SHA. It is a **pure** function with no HTTP, Cloudflare API, SQL, filesystem writes or provisioning. It returns `stagingResourcesProven=false`, `privateBrowserAccessProven=false`, `readyForStagingDeployment=false` and both activation authorizations `false` regardless of supplied data. CI has read-only GitHub permissions and uses mock/static tests only. A passing test is a design-review signal, not proof of actual Cloudflare configuration.

## Protected next gates

1. Obtain explicit owner approval of the phase-A architecture and exact-current-main SHA; record reviewer `thusico`'s independent approval on protected source.
2. Audit current Worker/D1 inventory, Workers routes, workers.dev, versions/bindings, secret *names and scopes* (never values), DNS and Access policies without modifying anything.
3. Require a dedicated `workspace-agent-private-staging` protected GitHub environment, main-only runs, self-review prevention, independent `thusico` approval and no bypass; ensure the owner, not reviewer, initiates the run.
4. Only after a separate **resource-provisioning approval**, create isolated Worker and D1 with synthetic data only, verify they have no production bindings or public network admission. A provisioned but unpublished Worker is **not** a live Agent browser preview.
5. Only after separate network/Access-policy approval, resolve the hostname-versus-no-route conflict and run real authenticated tenant isolation and accessibility testing. Later deployment and activation each require separate approvals.

**Production remains out of scope.** Do not enable the feature flag or reuse General AI, billing, POP, corporate assets or production D1 resources.
