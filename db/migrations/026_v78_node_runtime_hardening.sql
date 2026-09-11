-- v1.21.47 Node runtime/social-auth hardening
ALTER TABLE users ALTER COLUMN password_salt DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;

-- Existing installations created before deletion-worker states were introduced may
-- still have the narrower status constraint. Keep completion states fail-safe.
ALTER TABLE deletion_requests DROP CONSTRAINT IF EXISTS deletion_requests_status_check;
ALTER TABLE deletion_requests ADD CONSTRAINT deletion_requests_status_check CHECK(status IN ('requested','blocked','approved','processing','failed','completed','canceled'));
