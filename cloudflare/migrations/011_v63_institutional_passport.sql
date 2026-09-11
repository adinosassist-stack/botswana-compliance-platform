
ALTER TABLE passport_shares ADD COLUMN invalidated_at TEXT;
ALTER TABLE passport_shares ADD COLUMN invalidation_reason TEXT;
ALTER TABLE passport_shares ADD COLUMN issued_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE passport_shares ADD COLUMN issued_snapshot_hash TEXT;

CREATE TABLE IF NOT EXISTS passport_state(
  tenant_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  last_reason TEXT,
  last_source_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO passport_state(tenant_id,revision,last_reason)
SELECT id,0,'v63_baseline' FROM tenants;

CREATE TABLE IF NOT EXISTS passport_public_receipts(
  id TEXT PRIMARY KEY,
  receipt_code TEXT NOT NULL UNIQUE,
  share_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  passport_revision INTEGER NOT NULL,
  snapshot_hash TEXT NOT NULL,
  receipt_signature TEXT NOT NULL,
  public_snapshot_json TEXT NOT NULL,
  control_count INTEGER NOT NULL DEFAULT 0,
  score_value INTEGER,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(share_id) REFERENCES passport_shares(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS passport_public_receipts_share_idx
ON passport_public_receipts(share_id,issued_at DESC);

CREATE TABLE IF NOT EXISTS passport_share_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  share_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK(event_type IN ('CREATED','VIEWED','INVALIDATED','REVOKED')),
  event_data TEXT NOT NULL DEFAULT '{}',
  actor_user_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(share_id) REFERENCES passport_shares(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS passport_share_events_share_idx
ON passport_share_events(share_id,occurred_at DESC);

INSERT OR IGNORE INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES
 ('starter','institutional_passport',0,NULL),
 ('business','institutional_passport',0,NULL),
 ('pro','institutional_passport',1,NULL),
 ('partner','institutional_passport',1,NULL);


-- v63 trust-boundary reset: legacy Passport status was user-writable in earlier releases.
UPDATE passport_verifications
SET status='review',
    verified_at=NULL,
    metadata_json='{"source":"v63_migration","reason":"assurance_reverification_required"}'
WHERE status='verified';

UPDATE passport_shares
SET invalidated_at=CURRENT_TIMESTAMP,
    invalidation_reason='v63_security_reissue_required'
WHERE revoked_at IS NULL AND invalidated_at IS NULL;

UPDATE passport_state
SET revision=revision+1,
    last_reason='v63_security_reissue_required',
    updated_at=CURRENT_TIMESTAMP;

INSERT INTO passport_share_events(share_id,tenant_id,event_type,event_data)
SELECT id,tenant_id,'INVALIDATED','{"reason":"v63_security_reissue_required"}'
FROM passport_shares
WHERE invalidation_reason='v63_security_reissue_required';
