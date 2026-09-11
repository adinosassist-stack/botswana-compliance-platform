-- V78 1.21.68: privacy-preserving and generation-accurate session inventory.
ALTER TABLE sessions ADD COLUMN public_id TEXT;
UPDATE sessions SET public_id=lower(hex(randomblob(16))) WHERE public_id IS NULL OR trim(public_id)='';
CREATE UNIQUE INDEX IF NOT EXISTS sessions_public_id_uq ON sessions(public_id);
CREATE INDEX IF NOT EXISTS sessions_user_generation_live_idx ON sessions(user_id,session_generation,expires_at);
