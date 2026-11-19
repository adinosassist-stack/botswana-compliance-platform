# Essentials Phase C — ONE consolidated customer-only D1 migration qualification

**STRICT STATUS: SOURCE-ONLY, NOT EXECUTED AGAINST CLOUDFLARE.**
There is **no Phase C owner + independent `thusico` execution approval**. This package is a candidate for protected review, not authorization to deploy, query D1, upload a Worker, enable Access, create OIDC credentials, send invitations or touch real customers.

## Target already created, empty and isolated

| Gate | Exact target |
|---|---|
| Account | `ddd23cab31928a4bb3d4998df9b26d1d` |
| New empty D1 | `bw-essentials-customer-consent-private-staging` |
| D1 UUID | `56f48000-9d89-47d5-a077-47dfe0825662` |
| Historical empty-D1 bookmark | `00000000-00000006-00005128-6d86686240921679c478827323f4675c` |
| Later read-only bookmark | `00000001-00000000-00005128-d367f997ad2f7b44086eeda4bd19f97d` |
| Worker / Access | **NOT CREATED; no routes authorized** |
| Data | Synthetic only, no live customers |

The Time Travel bookmarks are **not proof of a successful restore** and may become stale. Recheck and independently attest immediately before any authorized migration.

## Exactly six customer-only schema files in strict order

| Order | SQL path under `cloudflare/migrations/` | Intent |
|---|---|---|
| 1 | `essentials_private_customer_only_baseline_STAGING_CANDIDATE.sql` | Frozen quote ONLY; preserves exact original immutable/anti-delete DDL |
| 2 | `essentials_private_customer_identity_links_STAGING_CANDIDATE.sql` | Current independent customer-account link registry (not proof of ownership on its own) |
| 3 | `essentials_private_verified_customer_sessions_STAGING_CANDIDATE.sql` | Outside-customer invitation, session and atomic issuance audit |
| 4 | `essentials_private_frozen_terms_customer_review_STAGING_CANDIDATE.sql` | Full immutable contract terms, audit and one-use review offer |
| 5 | `essentials_private_customer_final_consent_STAGING_CANDIDATE.sql` | Customer-specific verified consent, immutable server HMAC evidence and audit |
| 6 | `essentials_private_customer_invite_oidc_STAGING_CANDIDATE.sql` | External-customer invitation launch and OIDC PKCE state/audit |

This package intentionally **EXCLUDES** two employee-era tables from the old `essentials_private_consent_authority_STAGING_CANDIDATE.sql`:

- `essentials_private_verified_consents`
- `essentials_private_signed_receipts`

Both contain employee `actor_user_id` attribution and are not proof of an external customer's own consent. The historical legacy migration is **left unchanged** for legacy test coverage and must **never** be substituted back into this customer-only package.

### Clean-room qualification (offline, NOT Cloudflare)

The `Essentials offline qualification` GitHub Actions workflow calls `python3 tests/essentials_private_customer_only_cleanroom_sqlite.py` after the existing customer-specific SQL tests. On a fresh in-memory SQLite database, the test:

- Loads the exact ordered six candidate SQL files with foreign keys on, inside one explicit migration transaction
- Asserts **14 customer-only tables, 33 triggers**, required access indexes, all named FK targets and customer-specific receipt/evidence columns
- Enforces exact frozen-quote table/trigger DDL equality with the existing tested legacy source, without bringing over employee consent tables
- Performs `PRAGMA foreign_key_check` and `PRAGMA integrity_check`, tests frozen-quote mutation and delete denial, and verifies bare quotes without matching complete terms+audit cannot be read by the customer joined view
- Rejects duplicate migration attempts and proves a deliberately failed new clean-room transaction rolls back **all** schema objects
- Prints an exact six-file **SHA-256/UTF-8 byte manifest** to CI. Reviewers must independently calculate `sha256sum` from the actual reviewed checkout, verify the new baseline checksum and the five unchanged files, and approve those **exact values** against the exact source SHA. GitHub blob SHA-1 is not a substitute.

The four customer-specific SQL regression suites for sessions, full terms/review, verified customer consent and invitation/PKCE now load the customer-only baseline. The legacy actor suite continues to use the original employee-era migration **only in its own isolated test**.

**Important testing limit:** Even passing SQLite tests do not prove production D1 permissions, Access/preview lockout, actual IdP credentials, genuine account ownership or the legal significance of a customer acceptance. They are prerequisites for seeking approval, not an approval.

## Required guarded staging migration decision

The **owner (`adinosassist-stack`) and independent reviewer (`thusico`) must separately approve** a new exact-scope Phase C SQL operation after CI and checksum review:

1. **Code and scope:** exact new protected `main` SHA following formal `thusico` code review; the six file paths, individual SHA-256, byte lengths and ordered table/trigger manifest; strictly new D1 UUID `56f48000-9d89-47d5-a077-47dfe0825662` in account `ddd23cab31928a4bb3d4998df9b26d1d`. The previous source SHA and previous six-file checksums do **not** authorize the new baseline.
2. **Read-only preflight and recovery:** confirm exact D1 metadata and unshared bindings, independently verify emptiness using **separately authorized** D1 read-only inspection, refresh bookmark, document a real isolated restore drill/cleanup and review Time Travel, privacy and retention. A bookmark alone is not a restore rehearsal.
3. **Minimal execution:** no automatic execution by workflow, no production Finance/Payments/POP/General AI D1; no end-user data, no HTTP Worker/preview/worker.dev route, no secrets or customer IdP accounts. Execute only after exact-SQL owner + independent reviewer approval and a separate protected execution action.
4. **Postflight:** verify exact expected 14 tables, 33 triggers, FK and integrity checks, new bookmark, no production bindings, then record versioned evidence in issue #2695. If any check fails, STOP, use only the approved restore/cleanup procedure and requalify. No silent retries or new resource creation.
5. **Activation stays separately gated:** real IdP/client registration, verified customer invitation delivery, ownership source, private Access protection, Worker source/version upload/deploy, controlled synthetic customer acceptance E2E, backups/retention/key custody and real customer/public production are not included in Phase C schema approval.

**Governance:** one substantive source PR, full current-head GitHub CI, independent formal `thusico` code approval, then separate owner + independent reviewer exact-D1 SQL approvals. No small follow-up PRs. No cloud migration, Worker or Access operation is authorized by this document.
