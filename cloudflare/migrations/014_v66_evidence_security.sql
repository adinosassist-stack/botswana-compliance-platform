
ALTER TABLE evidence ADD COLUMN scan_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE evidence ADD COLUMN scan_last_error TEXT;
ALTER TABLE evidence ADD COLUMN scanned_at TEXT;
ALTER TABLE evidence ADD COLUMN scanner_provider TEXT;
ALTER TABLE evidence ADD COLUMN scan_result_hash TEXT;
ALTER TABLE evidence ADD COLUMN malware_name TEXT;
ALTER TABLE evidence ADD COLUMN clean_object_key TEXT;

CREATE TABLE IF NOT EXISTS evidence_scan_events(
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  scanner_provider TEXT,
  event_type TEXT NOT NULL
    CHECK(event_type IN ('QUEUED','STARTED','CLEAN','INFECTED','ERROR','RETRY','LEGACY_RESET')),
  status_before TEXT,
  status_after TEXT,
  result_hash TEXT,
  malware_name TEXT,
  error_text TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(evidence_id) REFERENCES evidence(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS evidence_scan_events_evidence_idx
ON evidence_scan_events(evidence_id,created_at DESC);

CREATE TABLE IF NOT EXISTS evidence_access_events(
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('DOWNLOAD','DOWNLOAD_BLOCKED','SCAN_RETRY')),
  result TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(evidence_id) REFERENCES evidence(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS evidence_access_events_tenant_idx
ON evidence_access_events(tenant_id,created_at DESC);

-- v66 trust-boundary reset: quarantine is not malware scanning.
UPDATE evidence
SET review_status='quarantined',
    reviewed_at=NULL,
    reviewed_by_user_id=NULL,
    scan_status='legacy_unscanned'
WHERE deleted_at IS NULL
  AND review_status='approved'
  AND COALESCE(scan_status,'') NOT IN ('clean');

INSERT INTO evidence_scan_events(id,evidence_id,tenant_id,event_type,status_before,status_after,details_json)
SELECT lower(hex(randomblob(16))),id,tenant_id,'LEGACY_RESET','review_required','legacy_unscanned',
       '{"reason":"v66_malware_scan_required_before_approval"}'
FROM evidence
WHERE deleted_at IS NULL AND scan_status='legacy_unscanned';


-- Invalidate downstream claims that depended on evidence demoted by the v66 trust reset.
UPDATE obligation_evidence_requirements
SET status='attached'
WHERE evidence_id IN (
  SELECT id FROM evidence WHERE scan_status='legacy_unscanned'
) AND status='verified';

UPDATE tenant_control_status
SET status=CASE WHEN status='not_applicable' THEN status ELSE 'review' END,
    assurance_level=CASE WHEN assurance_level IN ('evidence_backed','reviewed') THEN 'unverified' ELSE assurance_level END,
    evidence_health='missing',
    updated_at=CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM control_evidence_links l
  JOIN evidence e ON e.id=l.evidence_id
  WHERE l.tenant_id=tenant_control_status.tenant_id
    AND l.control_key=tenant_control_status.control_key
    AND e.scan_status='legacy_unscanned'
);

UPDATE passport_verifications
SET status='review',verified_at=NULL,
    metadata_json='{"source":"v66_migration","reason":"evidence_scan_reverification_required"}'
WHERE EXISTS (
  SELECT 1 FROM control_evidence_links l
  JOIN evidence e ON e.id=l.evidence_id
  WHERE l.tenant_id=passport_verifications.tenant_id
    AND l.control_key=passport_verifications.control_key
    AND e.scan_status='legacy_unscanned'
);

UPDATE passport_state
SET revision=revision+1,
    last_reason='v66_evidence_scan_reverification_required',
    updated_at=CURRENT_TIMESTAMP
WHERE tenant_id IN (
  SELECT DISTINCT tenant_id FROM evidence WHERE scan_status='legacy_unscanned'
);

UPDATE passport_shares
SET invalidated_at=COALESCE(invalidated_at,CURRENT_TIMESTAMP),
    invalidation_reason=COALESCE(invalidation_reason,'v66_evidence_scan_reverification_required')
WHERE tenant_id IN (
  SELECT DISTINCT tenant_id FROM evidence WHERE scan_status='legacy_unscanned'
) AND revoked_at IS NULL;

INSERT INTO passport_share_events(share_id,tenant_id,event_type,event_data)
SELECT id,tenant_id,'INVALIDATED','{"reason":"v66_evidence_scan_reverification_required"}'
FROM passport_shares
WHERE invalidation_reason='v66_evidence_scan_reverification_required'
  AND NOT EXISTS (
    SELECT 1 FROM passport_share_events x
    WHERE x.share_id=passport_shares.id
      AND x.event_type='INVALIDATED'
      AND x.event_data='{"reason":"v66_evidence_scan_reverification_required"}'
  );

UPDATE inspection_packs
SET status='stale'
WHERE status='ready'
  AND tenant_id IN (
    SELECT DISTINCT tenant_id FROM evidence WHERE scan_status='legacy_unscanned'
  );

UPDATE dispute_defense_packs
SET status='review_required'
WHERE status='assembled'
  AND EXISTS (
    SELECT 1 FROM hr_case_evidence_links l
    JOIN evidence e ON e.id=l.evidence_id
    WHERE l.tenant_id=dispute_defense_packs.tenant_id
      AND l.case_id=dispute_defense_packs.hr_case_id
      AND e.scan_status='legacy_unscanned'
  );
