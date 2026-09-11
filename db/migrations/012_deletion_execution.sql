
alter table evidence add column if not exists deletion_status text
  check(deletion_status in ('pending','deleted','error'));
alter table evidence add column if not exists deletion_attempts integer not null default 0;
alter table evidence add column if not exists deletion_error text;
alter table evidence add column if not exists storage_deleted_at timestamptz;

alter table deletion_requests add column if not exists approved_by uuid references users(id);
alter table deletion_requests add column if not exists approved_at timestamptz;
