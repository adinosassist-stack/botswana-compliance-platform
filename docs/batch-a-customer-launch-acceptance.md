# Batch A — Thebe Desk customer launch acceptance

Status: **NOT LAUNCH-APPROVED**. Tracks #1701, #1689, #1705, #1741.

## Customer-critical checks (one review package)

| Area | Automated gate | Human release evidence still required |
| --- | --- | --- |
| Navigation freeze | Workspace render, responsive frame, route recovery and navigation regressions | Authenticated production desktop/mobile: Dashboard → People → Documents → Employees → Dashboard, cold and warm, Chrome long tasks / INP and screenshot evidence; #1701 remains P0 |
| Owner console | Owner dashboard synthetic fixtures and payment admin access checks | Sign in as thebedesk@gmail.com; owner billing visible; no unintended cached alternative identity; business admin cannot see platform owner controls |
| Verify payment | Manual-bank owner confirmation, verified fulfilment, fail-closed settlement tests | An authorized owner independently verifies a real deposit and records observed payment order and UI results; never use synthetic evidence to activate a customer |
| Activate/deactivate subscription | Payment-backed pause/resume, stale status, expired period and cross-tenant rejection tests | Owner on/off control, active entitlement, status persistence and audit record observed across refresh and separate customer session |
| Onboarding and location | Existing browser and backend flows | New tenant signup, 5-location allowance, People Add Location error recovery and clean sign-out/re-sign-in |

## Merge and deployment policy

- Request **one independent review of this cohesive acceptance batch**; do not seek approvals for each existing test file.
- Keep current branch protection, required checks, reviewer rules, payment settlement requirements and regulatory approval gates intact.
- Passing Batch A CI is **necessary but insufficient**: do not close #1701 or call thebedesk.com launch-ready without authenticated deployed browser traces.
- Production promotion still follows BF-07 release authorization and postdeploy rollback/smoke checks.
- Botswana regulatory rules that lack current verified legal source evidence remain default-off; no regulatory import or database writes in Batch A.

## Blockers and decisions

1. **P0 navigation freeze** is reported after release 564 (#1701); root cause and deployed remedy are still unverified.
2. **Live owner billing and customer activation** have synthetic regression coverage but need actual authenticated end-to-end observation.
3. **Production access verification** was not possible from the assistant's public web check; lack of access is not proof of an outage.
4. Regulatory-source approval is a separate track; the core product must not represent pending statutory rules as verified.
