# Essentials authenticated integration contract

Status: design and offline helpers only; not a deployment authorization.

## Invoice draft creation
1. Authenticate the session on the server and enforce CSRF protections.
2. Resolve the tenant from the trusted session; never accept the client-supplied tenant as authority.
3. Load the quotation with a tenant-scoped query and enforce `invoice:draft:create`.
4. Verify source quotation eligibility and business status under a DB transaction.
5. Generate the invoice reference server-side. Insert invoice and line items atomically with unique tenant/reference and tenant/source/idempotency constraints.
6. Return a draft response only after the transaction commits. Do not mark it issued or paid.

## Payment schedules and reminders
- Fetch invoice balances and verified bank allocations from trusted tenant-scoped records.
- Use `previewInvoicePayments` for read-only calculations, not as a settlement verifier.
- Reconcile bank credits separately; screenshots, references and customer claims are not proof.
- Generate reminder text only for authorized invoice access, with user review before sending.

## PDF sharing and templates
- Require authenticated tenant-scoped access to the finalized PDF; never expose a public document URL.
- Keep existing Lovely Stones red quotation design, terms and bank details unchanged unless explicitly edited.
- Treat custom templates as validated preferences until persistent storage and PDF rendering are reviewed.
- Native share requires explicit user action and must never silently send messages.

## Acceptance evidence required before release
- Automated unit and cross-feature tests green on exact commit SHA.
- Negative tenant-isolation, CSRF, IDOR and duplicate/idempotency tests.
- Invoice reference collision and rollback/retry tests against isolated staging D1.
- PDF authorization, customer data handling and mobile UX checks.
- Independent thusico review and existing protected staging/production gates.
