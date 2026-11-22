# Customer onboarding 10/10 — implementation acceptance contract

Tracking: #2781. Source-only; no production activation authorized.

## Existing boundaries to preserve
- Account lifecycle already documents an onboarding status endpoint and welcome banner; inspect and reuse these before adding endpoints.
- Signup conversion staging is synthetic-cohort-only and explicitly denies external OAuth, reset delivery, and payment writes. Never turn that environment into customer production registration.
- C4 customer identity and atomic consent remain gated by #2695. Do not conflate customer quotation access with owner workspace signup.
- Manual payments are not activated on customer reference alone. Require verified settlement and owner authorization.

## Implementation sequence (single PR)
1. Map live owner registration, email verification, login, onboarding status, welcome banner and first-workspace journey; document exact routes, source/runtime parity and state ownership.
2. Reuse existing onboarding status; add resumable, server-validated setup state only if necessary. No password, token or PII in analytics/local storage.
3. Four accessible steps: account, business profile, workspace selection, first-success task. Botswana locale and BWP defaults must be editable.
4. Add explicit pending-verification, expired invite, blocked payment, retry, empty and offline/error states. Avoid suggesting an account is active until the server confirms it.
5. Add guided first quotation/invoice creation using existing tenant-scoped services; preserve C4 issuance and consent gates.
6. Instrument anonymous funnel stages and completion counts with consent/retention controls, without personal details.

## Required acceptance matrix
| Scenario | Expected |
|---|---|
| New owner, valid details | Verified session, correct tenant and resumable onboarding |
| Refresh or network failure during setup | Resume safely without duplicate tenant, user or subscription |
| Existing account registration | No duplicate account or misleading success |
| Invalid or expired verification/invite | Accessible error and safe retry; no role elevation |
| Manager invitation | Owner-initiated, tenant-bound, expiring, single use |
| Cross-tenant access | Denied in every API and document path |
| Quotation customer access | No access before real identity and atomic consent qualification |
| Manual payment pending | Clearly pending; no entitlement granted from reference alone |
| 320/375/414/430/768px, landscape, 200% zoom | No clipped labels, dock obstruction or inaccessible action |
| Keyboard and screen reader | Logical focus, labeled fields, errors announced, visible focus |
| First quotation or invoice | Real server result, not a demo mistaken for customer data |
| Staging vs production | No production mutation, Worker deploy or activation from this batch |

## Evidence and gates
Capture automated test outputs, exact reviewed SHA, authenticated Owner/Manager mobile screenshots, independent thusico review and separate production deployment decision. Do not rate as 10/10 until real-user completion, error recovery and accessibility checks pass.
