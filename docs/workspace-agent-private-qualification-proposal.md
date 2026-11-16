# Workspace Agent private qualification

Proposed design for issue #2433. The owner selected strict no-route staging. Protected inventory run [#2](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/43629680836) passed at `393a5a1d26b669bb2ed00aa55df9af4866544cd5`. It verified the proposed resource names were available and the service had no listed custom domain. Recheck inventory against the approved source before allocating anything.

## Minimum live test

Qualify authenticated read-only access to synthetic D1 responsibilities and prove that requests cannot read another tenant's data. Keep public routes, custom domains, workers.dev and preview URLs disabled. Do not bind production services or use customer records.

Evaluate a dedicated, unrouted test caller with a Cloudflare service binding to the isolated Agent Worker. Schedule or other invocation for the test caller requires separate design review. Use the binding to exercise synthetic HTTP session handling without public ingress. The existing Agent gate requires an exact HTTPS staging hostname and explicit activation. Prove compatibility offline first. Require a separately reviewed staging-only design change if needed. Keep the Agent flag off through inert provisioning and initial binding verification.

Use local Chromium for browser navigation, retry and accessibility. Service-binding checks cover the live backend only. A live remote browser session requires an independently approved private access design.

## Acceptance evidence

| Scenario | Expected result |
| --- | --- |
| Synthetic owner and manager in tenant A | Only tenant A responsibilities, with authorized workspace scope |
| Synthetic owner in tenant B | Only tenant B responsibilities, including after a tenant switch |
| Missing, expired or revoked session | Denial with no task data |
| Authenticated disallowed role | Denial with no task data |
| Successful empty result versus failed D1 read | Empty state for the first and retryable error for the second |
| Reload or switch workspace while a request is pending | No previous tenant or workspace data displayed |
| Inventory and operation trace | Exact source and staging resource IDs, zero public ingress and zero customer-data bindings or writes by advisory requests |

Use only synthetic accounts, sessions and responsibilities. Record pass/fail and redacted operation metadata.

## Execution and cleanup gates

1. Extend offline qualification with the selected caller invocation and result collection. Review source, least-privilege credentials, environment protections and resource names. Record exact current main and owner authorization for the bounded resource plan.
2. Require independent `thusico` approval in the protected main-only environment. Provision only authorized staging resources. Treat the first binding, fixture writes and Worker upload/deployment as separate actions requiring explicit scope.
3. Verify isolation before and after any separately approved test activation. Stop on account, resource ID, flag, route or binding mismatch.
4. Disable invocation and test activation when finished. Verify no active callers or bindings, and remove only explicitly authorized disposable staging resources by their recorded identifiers. Retain redacted test evidence and confirm production configuration is unaffected.

This proposal grants no resource or release authority. The Botswana manual-pay launch remains separately tracked in #1874.
