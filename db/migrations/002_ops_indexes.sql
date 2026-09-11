create index if not exists sessions_expiry_idx on sessions(expires_at) where revoked_at is null;
create index if not exists audit_request_idx on audit_events(request_id);
create index if not exists evidence_review_idx on evidence(tenant_id,review_date) where review_date is not null;
