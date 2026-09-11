alter table evidence add column if not exists upload_status text not null default 'metadata_only' check(upload_status in('metadata_only','pending','uploaded','failed'));
alter table evidence add column if not exists uploaded_at timestamptz;
create index if not exists evidence_upload_status_idx on evidence(tenant_id,upload_status);
