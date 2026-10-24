-- DESIGN/CI SECURITY BOUNDARY ONLY. NOT A MIGRATION. NEVER RUN IN PRODUCTION.
-- Apply only after db/schema.sql and ALL employee-dispatch PostgreSQL
-- draft scripts in the disposable GitHub Actions database.
--
-- SECURITY MODEL: The preview role deliberately has NO tenant-scoped access.
-- Even when the role is granted SELECT for verification, RLS denies every row.
-- This is not a usable worker/writer role. A real production role still needs
-- independently reviewed trusted session binding, policies, privileges and RLS.
--
-- In particular, never base a production tenant isolation policy solely on
-- current_setting('app.tenant_id'): any role able to SET that custom variable
-- could spoof another tenant unless a trusted boundary prevents doing so.
create role employee_dispatch_preview_reader nologin noinherit nobypassrls;

-- Revoke default PUBLIC privileges and give the disposable read-only probe
-- role only SELECT. Absolutely no direct DML, TRUNCATE or REFERENCES grants.
revoke all on table
  employee_dispatch_proposal_versions,
  employee_dispatch_proposal_heads,
  employee_dispatch_proposal_reviews,
  employee_dispatch_reviewer_permission_grants,
  employee_dispatch_grant_issuance_audit,
  employee_dispatch_grant_activation_audit,
  employee_dispatch_review_session_provenance,
  employee_dispatch_intents,
  employee_dispatch_admission_audit
from public;

grant usage on schema public to employee_dispatch_preview_reader;
grant select on table
  employee_dispatch_proposal_versions,
  employee_dispatch_proposal_heads,
  employee_dispatch_proposal_reviews,
  employee_dispatch_reviewer_permission_grants,
  employee_dispatch_grant_issuance_audit,
  employee_dispatch_grant_activation_audit,
  employee_dispatch_review_session_provenance,
  employee_dispatch_intents,
  employee_dispatch_admission_audit
to employee_dispatch_preview_reader;

-- Row security with NO permissive policies is an intentionally permanent
-- fail-closed preview. Table owners/superusers may bypass RLS in disposable
-- CI; production should never run the application as table owner/superuser.
alter table employee_dispatch_proposal_versions enable row level security;
alter table employee_dispatch_proposal_heads enable row level security;
alter table employee_dispatch_proposal_reviews enable row level security;
alter table employee_dispatch_reviewer_permission_grants enable row level security;
alter table employee_dispatch_grant_issuance_audit enable row level security;
alter table employee_dispatch_grant_activation_audit enable row level security;
alter table employee_dispatch_review_session_provenance enable row level security;
alter table employee_dispatch_intents enable row level security;
alter table employee_dispatch_admission_audit enable row level security;

-- Newly created PostgreSQL functions often grant EXECUTE to PUBLIC. Scope
-- these experimental trigger functions to their owning role only.
revoke all on function
  employee_dispatch_assign_review_sequence(),
  employee_dispatch_reject_review_mutation(),
  employee_dispatch_reject_proposal_version_mutation(),
  employee_dispatch_guard_grant_insert(),
  employee_dispatch_guard_grant_update(),
  employee_dispatch_reject_grant_delete(),
  employee_dispatch_issuance_audit_immutable(),
  employee_dispatch_guard_review_session_provenance(),
  employee_dispatch_require_review_session_provenance(),
  employee_dispatch_review_session_provenance_immutable(),
  employee_dispatch_guard_intent_insert(),
  employee_dispatch_reject_intent_mutation(),
  employee_dispatch_reject_admission_audit_mutation(),
  employee_dispatch_verify_activation_audit(),
  employee_dispatch_require_grant_activation_audit(),
  employee_dispatch_no_silent_grant_downgrade(),
  employee_dispatch_activation_audit_immutable(),
  employee_dispatch_require_creation_audit()
from public;

-- HOLD: This CI-only role is NOT a production service principal. Before any
-- production deployment, implement separate app roles with narrowly scoped
-- SECURITY INVOKER operations, trusted session/actor context, membership
-- verification, tenant RLS, migration/recovery and end-to-end adversarial
-- tests. Do not grant BYPASSRLS or use superuser/table-owner application login.
