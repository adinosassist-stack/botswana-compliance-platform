# Core Paid Public Launch — Evidence-Gated Acceptance (Botswana)

**Purpose:** Launch the existing Botswana core workspace with **manual bank payments only**, while keeping unqualified General AI, POP uploads, evidence uploads and automatic checkout out of scope. This checklist records **acceptance criteria**, not a claim of completion.

## Production/source truth at the 10 Nov 2026 audit

- The production manifest (`release/production.json`) remains sequence **607**, source `e365c678427c1b80efcf902bb6ee364f05d667c1`; `main` advanced beyond that source. A merged source or green pull request is **not** proof of deployment.
- The Cloudflare production Worker `bw-compliance-os` has the 10 Nov 2026 deployment version `ba653e60-bc0f-4be3-b28a-1aa8d76551a4`; active bindings showed `PAYMENT_PROVIDER=none`, `REGISTRATION_MODE=open`, `POP_UPLOAD_STAGING_ENABLED=false`, `EVIDENCE_UPLOADS_ENABLED=false`, `THEBE_AI_EXPORTS_ENABLED=false`, `THEBE_GENERAL_AI_ENABLED=false`. These observations must be rechecked during release.
- `server/payments/trusted-bank-settlement-gate.mjs` and `owner-bank-allocation-contract.mjs` are **reference-only**, not a verified authenticated bank feed, a DB-backed allocation transaction, or a production approval path.
- Independent owner/reviewer release authority and exact-source BF-07, Recovery, and protected deployment gates remain mandatory. No freeze on unrelated `main` merges is currently agreed.

## P0: minimum paid launch gates

| Gate | Required objective evidence | Failure action |
| --- | --- | --- |
| P0-1 Bank settlement truth | Authorized backend source or independent inspection of Thebe Desk's actual company bank account establishes **matching, cleared and unreversed BWP credit**; source, account, transaction unique ID, amount, reference, timestamp and finality recorded server-side | Keep payment pending; reject screenshots, customer refs, imported customer CSV and owner toggles as sole proof |
| P0-2 Atomic allocation | One bank transaction can fund one invoice once, globally and transactionally; separate tenant and invoice constraints; concurrent duplicate/replay and reversal tests | No activation on conflicts, retries or uncertain state |
| P0-3 Owner workflow | Signed-in, authorized owner reviews the server-owned evidence, approves or rejects with persistent audit; a rejection/resubmission never bypasses settlement and auth | Remain pending/rejected; no implicit activation |
| P0-4 Subscription durability | **Actual** customer invoice is activated only after P0-1 through P0-3, appears accurately on owner dashboard, persists after refresh and customer logout/login; wrong-tenant and nonowner access denied | No public claim of paid subscriptions functioning |
| P0-5 Release authorization | One manifest-only next-sequence release candidate tied to a verified exact source; green required CI/Recovery, no review threads, independent `thusico` approval, published BF-07 seal, protected production review, rollback evidence | Do not merge/deploy or relabel old release as current |
| P0-6 Live authenticated acceptance | Evidence links for registration, login, account workspace, manual invoice, owner payment view, real bank credit approval, entitlement persistence, mobile usability, and negative cases | Restrict launch to trial or controlled pilot until proven |
| P0-7 Customer and operational disclosures | Confirm contracting entity/registration details, current terms and privacy, live manual bank instructions, verified customer support and incident ownership; test actual contact channels | Do not market unsupported legal, payment or support claims |

## Manual-payment E2E execution order

1. Create a disposable test tenant and a unique BWP invoice under approved staging or an authorized production acceptance account. Record test IDs privately, **never credentials or account numbers in a public issue**.
2. Capture a verifiable bank-origin settled credit to the real Thebe Desk company bank account (or a segregated authorized staging bank feed for staging tests). Confirm account ownership, finality, amount, reference, transaction identity and absence of reversal independently.
3. Test the bank evidence adapter's provenance and immutable transaction ID, then commit bank-credit-to-invoice allocation atomically, with competing concurrent allocations. A structural predicate returning eligible is not proof of bank provenance.
4. Sign in as authorized owner. Verify one invoice once; confirm audit actor, event and activation persisted. Retry approval, replay the transfer ID, reject and resubmit, cross-tenant actor and concurrent request; all must fail closed without double allocation.
5. Sign in as customer, refresh and log out/in. Confirm correct plan, expiry and invoice status from durable server records; verify mobile layout and owner dashboard.
6. Collect **redacted** test evidence, exact release SHA, backend/provider traces, required reviewer approval and rollback path. Do not include transaction details, account numbers or secrets in public GitHub comments.

## Launch scope decisions

**Eligible for controlled public paid release only after P0 gates pass:** Core Botswana workspace, 14-day trial, manual bank invoice, independently verified owner approval, activated subscription and support.

**Explicitly out of first paid-release scope until separate review:** Automatic checkout; POP evidence upload and D1 migration 070/071; General AI, research and AI exports; automatic bank settlement acceptance; unreviewed production features. A feature flag being present or a staging Worker deployed does not mean the feature is production-ready.

## Coordination / artifacts

- P0 manual payment acceptance: [#1874](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/1874).
- Release provenance and BF-07 coordination: [#2354](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/2354).
- Corporate Assets protected read-only qualification, **not a P0 commercial-launch dependency**: [#2204](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/2204).
- Existing operational runbook: [docs/LAUNCH.md](LAUNCH.md). Existing launch runbook refers to DPO test credentials and evidence uploads; for **manual-bank-only** initial paid launch, use the narrower scope above, and do **not** claim readiness of currently disabled evidence upload features.

Record the completed P0 evidence in #1874 and the exact production release identity in #2354. Never close either issue or advertise paid-launch acceptance based only on offline tests, mocked bank evidence, merge status or a successful staging deploy.
