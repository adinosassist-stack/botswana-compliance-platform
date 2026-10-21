-- Employee-created AI workflow definitions. Configuration only: no automatic execution.
-- Migration is applied only through the normal reviewed migration process.
create table if not exists employee_ai_workflows (
  tenant_id text not null,
  owner_id text not null,
  workflow_id text not null,
  definition jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, owner_id, workflow_id),
  constraint employee_ai_workflow_id_format check (workflow_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  constraint employee_ai_workflow_definition_object check (jsonb_typeof(definition) = 'object'),
  constraint employee_ai_workflow_definition_size check (octet_length(definition::text) <= 16384)
);
create index if not exists employee_ai_workflows_owner_updated_idx
  on employee_ai_workflows (tenant_id, owner_id, updated_at desc);
