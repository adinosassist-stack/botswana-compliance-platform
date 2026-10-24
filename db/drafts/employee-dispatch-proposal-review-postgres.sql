-- DESIGN DRAFT ONLY. NOT A MIGRATION. DO NOT APPLY TO PRODUCTION.
-- Requires review of identity mapping, revocation locking, RLS and rollback.
create table employee_dispatch_proposal_versions (
  tenant_id text not null,
  proposal_id text not null,
  revision bigint not null check (revision > 0),
  author_id text not null,
  action text not null check (action in ('internal.task.create','internal.report.draft')),
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (tenant_id, proposal_id, revision)
);

-- Mutable current pointer must be locked FOR UPDATE before dispatch admission.
create table employee_dispatch_proposal_heads (
  tenant_id text not null,
  proposal_id text not null,
  current_revision bigint not null,
  revoked boolean not null default false,
  primary key (tenant_id, proposal_id),
  foreign key (tenant_id, proposal_id, current_revision)
    references employee_dispatch_proposal_versions(tenant_id, proposal_id, revision)
);

create table employee_dispatch_proposal_reviews (
  tenant_id text not null,
  review_id text not null,
  proposal_id text not null,
  proposal_revision bigint not null,
  reviewer_id text not null,
  decision text not null check (decision in ('approved','rejected','revoked')),
  reviewed_at timestamptz not null default now(),
  primary key (tenant_id, review_id),
  foreign key (tenant_id, proposal_id, proposal_revision)
    references employee_dispatch_proposal_versions(tenant_id, proposal_id, revision)
);
create index employee_dispatch_review_latest_idx
  on employee_dispatch_proposal_reviews (tenant_id, proposal_id, reviewed_at desc, review_id desc);

-- Review decisions and proposal versions require append-only DB privileges.
-- The application must reject reviewer_id = author_id and reviewer_id = dispatcher.
-- This draft deliberately omits triggers and RLS until the canonical tenant and
-- principal identity model and authoritative review lifecycle are established.
