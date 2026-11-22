# Thebe Desk Essentials — next consolidated paid-core implementation batch

**Source-only. Not a bank receipt, production payment activation, staging migration, subscription entitlement or live release approval.**

## Fresh repository audit
- Source basis: protected main `614a978f4f473a505d939667a77d390e18f177e6` (Release 645).
- The core quote-to-invoice `server/essentials-invoice-transaction.mjs`, `essentials-quote-to-invoice.mjs`, private invoice HTTP adapter and isolated D1 draft composition already exist. They are not a live customer invoice/issuance service. Use their transactional tenant and idempotency contracts; **do not** mount them publicly or duplicate Finance Core.
- `server/essentials-payment-schedule.mjs` already calculates unpaid deposits and instalments in integer thebe; it is a side-effect-free PREVIEW. `settlementVerified:true` in a preview object is never bank evidence or a paid subscription.
- The owner bank policy `server/payments/owner-payment-evidence-policy.mjs` and Miniflare D1 uniqueness reference already exist and are **offline/reference only**. Live manual bank approval goes through the existing platform-owner route and must be accepted using actual independently observed cleared bank credit; customer-submitted POP/reference does not suffice.
- No legal entity is assumed: paid Terms/Privacy issue #2413 requires CIPA-verified contracting entity, current addresses, refund/billing/data disclosures and legal owner sign-off. Do not insert Lovely entity by inference.

## Confirmed gaps repaired in this batch
1. Reference owner payment evidence previously checked only the label `settled` while not checking `finality`, `reversed`, `chargeback`, `reversalPending`, effective settlement time, observation time or business account identity. It could structurally mark a reversed/unfinalized receipt VERIFIED if a caller supplied `status:'settled'`. Now require explicit finality, no reversal/chargeback, valid timestamps and exact verified opaque BWP company-account key. An absent or future-dated field fails closed. **All evidence must come from a trusted, server-side bank observation process; owner/customer booleans cannot generate actual bank provenance.**
2. Invoice draft idempotent replay now rejects amount, currency and source quotation reference drift **when those fields exist on a server-loaded draft**; insert adapter cannot report a mismatched draft amount as success.
3. Pure deposit/installment preview now rejects zero-thebe settled allocations. Scheduled but unpaid deposits/installments remain outstanding until authorized settlement.
4. Targeted failure tests and dedicated offline CI. Real disposable Miniflare D1 uniqueness still requires its existing test harness, without any remote Cloudflare mutation.

## Remaining work required for a small paid launch
| Gate | Operational acceptance | Can be done without a bank API? |
| --- | --- | --- |
| Manual subscription owner verification (#1874) | Actual business bank account shows cleared, unreversed BWP credit, correct amount/reference, owner session, audit & unique allocation | Yes, manually — but MUST show real independent bank evidence |
| Quotation → invoice (#2735 / #2670) | Signed-in tenant quote save/reload, accepted quote frozen, transactional unique invoice numbering and duplicate/revision tests | Yes, after isolated D1 qualification and protected approval |
| Deposits/installments | Persisted immutable invoice allocations and truthful balance, no customer self-attestation of settlement | Yes, under approved server transaction |
| Job profit | Approved cost entries with tenant-scoped actual expenses, accurate receipts and margin; no projected cash misreported as settled | Yes, isolated integration and E2E needed |
| Legal (#2413) | Confirm CIPA contracting name, registration/address and Botswana Terms/Privacy/refunds/billing support | Owner/legal review required |
| Mobile | On-device Android Chrome/WebView PDF + WhatsApp sharing acceptance, no overlay at 320–430px | Device/real browser required |

## Protected progression
- **G0 (this PR):** exact-head source CI, real local simulated D1 concurrency and independent `thusico` review; no deploy.
- **G1:** separate owner and `thusico` approval for exact source/checksum/isolated staging resource; D1 Time Travel bookmark/retention/restore and actual synthetic staging tests, only after explicit authorization. Never reuse stale #2670/#2695 approvals.
- **G2:** manual bank workflow E2E with owner-observed actual company credit, D1 uniqueness, rejection and resubmission, refresh/login entitlement durability; capture redacted evidence. Never invent transactions or mark a sample receipt paid.
- **G3:** verified contracting entity + legal text, real mobile/browser acceptance, separate BF-07 release-manifest PR, required checks, owner-initiated deploy and independent production approval. Do not confuse PR approval with deployment approval.

Manager private staging, advanced AI/exports, POP uploads, real customer identity/consent and Thebe Life remain **outside** initial Essentials paid acceptance unless independently qualified.
