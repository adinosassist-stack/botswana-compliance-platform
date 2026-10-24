# Employee dispatch Batch #2 — PostgreSQL tenant isolation qualification

**Status: CI-only design / NO PRODUCTION MIGRATION OR ACTIVATION.**

This is one consolidated branch/PR/review for a bounded tenant DB access experiment, following the merged Batch #1 reviewer-permission lifecycle. The test runs inside the existing disposable PostgreSQL 16 integration workflow.

## Architectural boundary

The Node backend's canonical identities are UUIDs (`tenants.id`, `users.id`), but some employee dispatch proposal/outbox draft tables use `tenant_id text`. Batch #2 does **not** silently change or migrate either schema; it explicitly maps PostgreSQL test roles to canonical `tenants.id` UUIDs and compares the mapped UUID (or its canonical text representation) in nine table RLS policies.

The test starts with two different NOLOGIN, NOINHERIT, NOBYPASSRLS database roles. Only inside disposable CI are unique temporary passwords assigned and LOGIN enabled so tests can connect as genuinely different unprivileged PostgreSQL users. The role-to-tenant mapping is owner-managed; roles can SELECT only their own binding, cannot change bindings, and cannot become a sibling tenant role.

All nine dispatch draft tables retain RLS and give those two roles SELECT only. No INSERT, UPDATE, DELETE, TRUNCATE, permission issuance, review writing, grant activation, or autonomous action is permitted. The existing preview role stays excluded from every policy and receives zero tenant records.

The policy uses **`current_user`**, not `current_setting('app.tenant_id')` or other user-settable application parameters. The test deliberately sets fake tenant and actor custom settings and verifies it cannot read the other tenant's rows.

## Integrated test gate

1. Run Batch #1 grant lifecycle, immutable audit, and end-to-end session-backed review tests against disposable PostgreSQL.
2. Verify the unrestricted preview role sees zero rows and cannot write; these tests run *before* adding any tenant-specific policy.
3. Install the two-role tenant isolation reference, then connect with real separate Postgres login sessions and test cross-tenant reads, sibling `SET ROLE` failures, tenant mapping immutability, direct write denial, inaccessible canonical sessions/memberships, and spoofed GUCs.
4. Require the full repository CI set and independent reviewer approval on the final exact head before merging. A merge into `main` does not deploy or enable anything.

## Remaining HOLD items for production

- **Trusted DB principal binding**: Production needs an authenticated, reviewed strategy for mapping application session/tenant to a database role, including connection pooling, role provisioning/rotation, revocation, and no cross-tenant connection reuse. These fixed CI-only tenant roles are not that design.
- **Schema and tenancy migration**: Canonical UUIDs, FK constraints, prior data, backup, reversible migration, triggers/permissions and RLS must be independently qualified. Never run draft SQL files on production databases.
- **Writable operations**: A separate least-privileged path must authenticate and authorize grant changes, review decisions and outbox writes. Broad SQL INSERT/UPDATE powers or a spoofable session variable are unacceptable. The CI roles in this batch are deliberately **read-only**.
- **Session provenance**: A privileged SQL writer able to choose a valid session UUID can still falsify an audit association without trusted caller identity. The current draft services are not a production trust boundary.
- **Worker and release**: Default-off worker, lease fencing, crash/retry idempotency, dead-letter recovery, safe internal-only action adapters, observability, exact build provenance, production navigation performance checks, rollback and separate activation approval remain required.

Feature OFF; kill switch ON. `release/production.json` intentionally unchanged.
