-- Apply once to an existing v35 D1 database.
ALTER TABLE sessions ADD COLUMN csrf_token TEXT;
CREATE TABLE IF NOT EXISTS password_reset_tokens(
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id,expires_at);
