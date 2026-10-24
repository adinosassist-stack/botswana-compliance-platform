-- DESIGN ADD-ON ONLY. NOT A MIGRATION. NEVER APPLY TO PRODUCTION.
-- Requires disposable CI to first load db/schema.sql, then the proposal/review
-- and explicit reviewer-permission drafts. This add-on intentionally makes
-- review insertion fail without a matched session provenance row by COMMIT.
-- Existing records would require a separately designed migration/reconciliation.
create table employee_dispatch_review_session_provenance (
  tenant_id text not null,
  review_id text not null,
  session_id uuid not null references sessions(id),
  reviewer_user_id uuid not null references users(id),
  recorded_at timestamptz not null default now(),
  primary key (tenant_id, review_id),
  foreign key (tenant_id, review_id)
    references employee_dispatch_proposal_reviews(tenant_id, review_id)
);

-- The review's original author, current head, permission grant and issuer,
-- authenticated session, session generation, and live tenant membership must
-- all agree when the provenance record is created. The same transaction owns
-- the proposal-head lock inherited from the review insertion.
create function employee_dispatch_guard_review_session_provenance()
returns trigger language plpgsql as $employee_provenance$
declare
  permitted boolean;
begin
  select true into permitted
    from employee_dispatch_proposal_reviews r
    join employee_dispatch_proposal_heads h
      on h.tenant_id=r.tenant_id and h.proposal_id=r.proposal_id
    join employee_dispatch_proposal_versions v
      on v.tenant_id=h.tenant_id and v.proposal_id=h.proposal_id
     and v.revision=h.current_revision
    join sessions s on s.id=new.session_id
    join users u on u.id=s.user_id
    join memberships m on m.tenant_id=s.tenant_id and m.user_id=s.user_id
    join employee_dispatch_reviewer_permission_grants g
      on g.tenant_id=m.tenant_id and g.reviewer_user_id=m.user_id
    join memberships issuer
      on issuer.tenant_id=g.tenant_id and issuer.user_id=g.granted_by_user_id
   where r.tenant_id=new.tenant_id and r.review_id=new.review_id
     and r.reviewer_id=new.reviewer_user_id::text
     and r.proposal_revision=h.current_revision
     and r.review_sequence=h.last_review_sequence
     and h.revoked=false and v.author_id<>r.reviewer_id
     and s.user_id=new.reviewer_user_id
     and s.tenant_id::text=new.tenant_id
     and s.revoked_at is null and s.expires_at>now()
     and s.session_generation=u.session_generation
     and m.status='active' and m.role in ('owner','manager','reviewer')
     and g.permission='people.workflow.approve'
     and g.enabled=true and g.revoked_at is null
     and issuer.status='active' and issuer.role='owner'
     and issuer.user_id<>m.user_id
   for share of s,u,m,g,issuer,h;
  if permitted is distinct from true then
    raise exception 'unverified_employee_review_session' using errcode='23514';
  end if;
  return new;
end;
$employee_provenance$;
create trigger employee_dispatch_review_session_evidence_guard
  before insert on employee_dispatch_review_session_provenance
  for each row execute function employee_dispatch_guard_review_session_provenance();

create function employee_dispatch_require_review_session_provenance()
returns trigger language plpgsql as $employee_provenance$
begin
  if not exists (
    select 1 from employee_dispatch_review_session_provenance p
     where p.tenant_id=new.tenant_id and p.review_id=new.review_id
       and p.reviewer_user_id::text=new.reviewer_id
  ) then
    raise exception 'employee_review_session_provenance_required'
      using errcode='23514';
  end if;
  return null;
end;
$employee_provenance$;
create constraint trigger employee_dispatch_review_session_required
  after insert on employee_dispatch_proposal_reviews
  deferrable initially deferred
  for each row execute function employee_dispatch_require_review_session_provenance();

create function employee_dispatch_review_session_provenance_immutable()
returns trigger language plpgsql as $employee_provenance$
begin
  raise exception 'employee_review_session_provenance_immutable' using errcode='23514';
end;
$employee_provenance$;
create trigger employee_dispatch_review_session_evidence_immutable
  before update or delete on employee_dispatch_review_session_provenance
  for each row execute function employee_dispatch_review_session_provenance_immutable();

-- The authenticated application service MUST derive session ID from trusted
-- middleware. SQL superusers and broadly privileged writers could still forge
-- evidence if they know a valid session ID. Least-privilege grants, RLS and
-- trustworthy role/session provenance remain mandatory production blockers.
-- This draft never creates an execution endpoint or grants dispatch authority.
