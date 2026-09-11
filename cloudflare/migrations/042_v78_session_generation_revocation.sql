-- V78 1.21.67: generation-based session revocation.
-- A session is valid only while its captured generation matches the user's current generation.
ALTER TABLE users ADD COLUMN session_generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN session_generation INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS sessions_user_generation_idx ON sessions(user_id,session_generation,expires_at);
