-- DESIGN DRAFT ONLY. NOT A MIGRATION. NEVER APPLY TO PRODUCTION.
-- Requires db/schema.sql and employee-dispatch-reviewer-permission-postgres.sql
-- in an isolated, disposable PostgreSQL CI database.
--
-- An audited disabled grant is NOT a permission grant to execute work:
-- enabling grants requires a separate trusted, independently reviewed process.
create table employee_dispatch_grant_issuance_audit (
  event_id uuid primary key,
  tenant_id uuid not null,
  reviewer_user_id uuid not null,
  permission text not null check (permission='people.workflow.approve'),
  issuer_user_id uuid not null,
  issuer_session_id uuid not null,
  event_type text not null check (event_type='employee.reviewer_grant.issued_disabled'),
  recorded_at timestamptz not null default now(),
  unique (tenant_id, reviewer_user_id, permission),
  foreign key (tenant_id, reviewer_user_id, permission)
    references employee_dispatch_reviewer_permission_grants
      (tenant_id, reviewer_user_id, permission),
  foreign key (tenant_id, issuer_user_id)
    references memberships (tenant_id, user_id),
  foreign key (issuer_session_id) references sessions(id),
  check (issuer_user_id <> reviewer_user_id)
);

create function employee_dispatch_issuance_audit_immutable()
returns trigger language plpgsql as $employee_audit$
begin
  raise exception 'employee_dispatch_issuance_audit_immutable' using errcode='23514';
end;
$employee_audit$;
create trigger employee_dispatch_issuance_audit_no_mutation
  before update or delete on employee_dispatch_grant_issuance_audit
  for each row execute function employee_dispatch_issuance_audit_immutable();

-- Not production ready: SQL privileges and row-level security must prevent
-- untrusted direct grant/audit inserts. The server must supply authenticated
-- session identity, not a value from request JSON. No grant activation or
-- dispatch authorization may be inferred from these draft records.
