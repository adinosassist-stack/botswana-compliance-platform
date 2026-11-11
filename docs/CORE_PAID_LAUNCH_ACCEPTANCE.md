# Core Paid Public Launch — Evidence-Gated Acceptance (Botswana)

**Purpose:** Launch the existing Botswana core workspace with **manual bank payments only**. The owner has chosen **independently checked company-bank transfers for now; no FNB API, automatic bank feed or payment gateway is a prerequisite**. Unqualified General AI, POP uploads, evidence uploads and automatic checkout remain out of scope. This checklist records **acceptance criteria**, not a claim of completion.

## Production/source truth — verified Release 608 (11 Nov 2026)

- Release manifest sequence **608** at main merge SHA `04dc9b990561ac8cdc63e55949feea0b9db2f17d`, with reviewed source `ec02c9545571f8d4bc51cb83052c0155f3ea20e7`. Protected [deployment run #784](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/43019499708) finished **SUCCESS**, including exact-main qualification, BF-07 seal restore, dry-run, deployment and live readiness checks.
- Read-only Cloudflare deployment inspection confirmed the production Worker `bw-compliance-os` version `24006f39-c377-41ae-a2ac-d4959ae54dbb` received **100% traffic** at `2026-11-11T13:54:17Z`, deployment `85597502-e709-4a94-8294-491e3d585f10`. These are point-in-time observations, not continuous monitoring.
- Read-only inspection of that immutable Worker version verified `PAYMENT_PROVIDER=none`, `POP_UPLOAD_STAGING_ENABLED=false`, `THEBE_AI_EXPORTS_ENABLED=false`, `THEBE_GENERAL_AI_ENABLED=false`. This retains **manual bank-only payments**, not automatic checkout. Do not assume uninspected flags are enabled or disabled.
- Production manual-review route `POST /api/platform/billing/manual-payments/:submissionId/(approve|reject)` in `cloudflare/src/worker.js` enforces platform owner access, three separate bank confirmations, a required bank-issued transaction ID distinct from the customer reference, audited review, D1 uniqueness and authoritative payment/fulfillment/subscription checks. The reviewer inputs the bank transaction identity and confirmations after **independently inspecting actual company-account credit**; this route is **not a direct authenticated bank feed**.
- `server/payments/trusted-bank-settlement-gate.mjs` and `server/payments/owner-bank-allocation-contract.mjs` are explicitly **reference-only**. Passing their offline tests does not prove a real bank transfer, live owner approval, replay/reversal safety, customer re-login or entitlement persistence.
- **Paid public-launch acceptance remains P0 HOLD:** no independently documented real, cleared and unreversed company-bank BWP credit through an authenticated owner/customer end-to-end transaction. Public Terms and Privacy still require verified contracting-entity/privacy disclosures (issue #2413). Do not mark P0-1/2/3/4/6/7 complete solely from Release 608 deployment.
- Release source and immutable Worker must be reverified for future promotion. Independent owner/reviewer release authority, recovery and protected deployment gates remain mandatory. Unrelated main changes are not paused by this document.

## P0: minimum paid launch gates

| Gate | Required objective evidence | Failure action |
| --- | --- | --- |
| P0-1 Bank settlement truth | Authorized owner independently signs into Thebe Desk's **actual company bank account** and observes a **matching, cleared, unreversed BWP credit** before approval. Capture a minimal auditable server-side confirmation with actor, order, observed bank transaction identity, settled amount, finality and time; never publish account details. An optional future authenticated bank feed may automate this, but is **not** required for this manual launch. | Keep payment pending if funds cannot be independently seen, or if evidence is ambiguous; customer screenshots, POPs, references and owner booleans without actual inspection are not proof |
| P0-2 Atomic allocation | One bank transaction can fund one invoice once, globally and transactionally; separate tenant and invoice constraints; concurrent duplicate/replay and reversal tests | No activation on conflicts, retries or uncertain state |
| P0-3 Owner workflow | Signed-in, authorized owner reviews the server-owned evidence, approves or rejects with persistent audit; a rejection/resubmission never bypasses settlement and auth | Remain pending/rejected; no implicit activation |
| P0-4 Subscription durability | **Actual** customer invoice is activated only after P0-1 through P0-3, appears accurately on owner dashboard, persists after refresh and customer logout/login; wrong-tenant and nonowner access denied | No public claim of paid subscriptions functioning |
| P0-5 Release authorization | One manifest-only next-sequence release candidate tied to a verified exact source; green required CI/Recovery, no review threads, independent `thusico` approval, published BF-07 seal, protected production review, rollback evidence | Do not merge/deploy or relabel old release as current |
| P0-6 Live authenticated acceptance | Evidence links for registration, login, account workspace, manual invoice, owner payment view, real bank credit approval, entitlement persistence, mobile usability, and negative cases | Restrict launch to trial or controlled pilot until proven |
| P0-7 Customer and operational disclosures | Confirm contracting entity/registration details, current terms and privacy, live manual bank instructions, verified customer support and incident ownership; test actual contact channels | Do not market unsupported legal, payment or support claims |

## Manual-payment launch decision (11 November 2026)

The initial commercial workflow is **customer bank transfer → submitted reference → pending review → authorized owner independently checks settled funds in the actual company bank account → server-side duplicate/allocation and audit checks → owner approval → subscription entitlement**. Bank APIs and automatic checkout are explicitly deferred; no customer-provided POP, screenshot or reference can independently change a paid-plan entitlement. Use the existing five website pricing tiers without introducing new pricing. Rejected, reversed, unmatched or uncertain credits remain pending/rejected until independently resolved. Disallow duplicate activation from the same credit. This is an operating-model decision, **not** acceptance evidence that live payment approval is safe or complete.

## Manual-payment E2E execution order

1. Create a disposable test tenant and a unique BWP invoice under approved staging or an authorized production acceptance account. Record test IDs privately, **never credentials or account numbers in a public issue**.
2. Authorized owner opens the **company bank's own authenticated account view or official statement independently** (not a customer-provided document) and checks that the BWP credit has cleared and is not reversed. Compare the bank's unique transaction identity, date/time, amount and payment/order reference. No FNB API integration is required for this manual process. Never paste bank credentials, statements or full bank details into GitHub or customer-facing logs.
3. In the owner payment-review workflow, record and protect the independently inspected bank transaction identity through a **server-authoritative audit and unique invoice allocation**, with competing concurrent allocations, duplicate references and replays denied. Existing reference-only local D1 tests are not proof this is wired into production; **hold paid-launch acceptance until the real path is proven**. A structural predicate or three UI confirmations alone cannot prove bank provenance.
4. Sign in as authorized owner. Verify one invoice once; confirm audit actor, event and activation persisted. Retry approval, replay the transfer ID, reject and resubmit, cross-tenant actor and concurrent request; all must fail closed without double allocation.
5. Sign in as customer, refresh and log out/in. Confirm correct plan, expiry and invoice status from durable server records; verify mobile layout and owner dashboard.
6. Collect **redacted** test evidence, exact release SHA, owner-side bank-inspection acknowledgement, persistent allocation/audit results, required reviewer approval and rollback path. Do not include actual transaction IDs, account numbers, bank statements, credentials or secrets in public GitHub comments.

## Launch scope decisions

**Eligible for controlled public paid release only after P0 gates pass:** Core Botswana workspace, 14-day trial, manual bank invoice, independently verified owner approval, activated subscription and support.

**Explicitly out of first paid-release scope until separate review:** Automatic checkout, FNB API/direct bank feeds, automated bank settlement acceptance; POP evidence upload and D1 migration 070/071; General AI, research and AI exports; unreviewed production features. A feature flag being present or a staging Worker deployed does not mean the feature is production-ready.

## Coordination / artifacts

- P0 manual payment acceptance: [#1874](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/1874).
- Release provenance and BF-07 coordination: [#2354](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/2354).
- Corporate Assets protected read-only qualification, **not a P0 commercial-launch dependency**: [#2204](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/2204).
- Existing operational runbook: [docs/LAUNCH.md](LAUNCH.md). Existing launch runbook refers to DPO test credentials and evidence uploads; for **manual-bank-only** initial paid launch, use the narrower scope above, and do **not** claim readiness of currently disabled evidence upload features.

Record the completed P0 evidence in #1874 and the exact production release identity in #2354. Never close either issue or advertise paid-launch acceptance based only on offline tests, mocked bank evidence, merge status or a successful staging deploy.
