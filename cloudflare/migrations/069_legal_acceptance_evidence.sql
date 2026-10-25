-- Canonical legal acceptance evidence for registrations and first-party OAuth onboarding.
-- The policy row's effective_at is set when this migration is applied so pre-existing
-- accounts are not retroactively blocked from their workspace.

CREATE TABLE IF NOT EXISTS legal_acceptance_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  effective_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO legal_acceptance_policy(id, terms_version, privacy_version, effective_at)
VALUES (1, '2026-10-14', '2026-10-14', CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(tenant_id, user_id, terms_version, privacy_version)
);

CREATE INDEX IF NOT EXISTS legal_acceptances_tenant_accepted_idx
  ON legal_acceptances(tenant_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS legal_acceptances_user_accepted_idx
  ON legal_acceptances(user_id, accepted_at DESC);
