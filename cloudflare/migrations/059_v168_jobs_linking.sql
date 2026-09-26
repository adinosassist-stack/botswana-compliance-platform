-- V168: privacy-minimised Jobs linking for owner-managed recruitment.
-- Public applicants never receive workspace or employee access. No AI ranking/scoring is stored.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS job_openings(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  employment_type TEXT NOT NULL DEFAULT 'unspecified'
    CHECK(employment_type IN ('unspecified','permanent','fixed_term','part_time','temporary','internship')),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  closes_on TEXT,
  public_token_hash TEXT NOT NULL UNIQUE,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(closes_on IS NULL OR length(closes_on)=10),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS job_openings_tenant_status_idx
  ON job_openings(tenant_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS job_applications(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  contact_type TEXT NOT NULL CHECK(contact_type IN ('email','phone')),
  contact_value TEXT NOT NULL,
  contact_hash TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'received'
    CHECK(status IN ('received','review','interview','offer','hired','rejected','withdrawn')),
  consent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,job_id,contact_hash),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(job_id) REFERENCES job_openings(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS job_applications_job_status_idx
  ON job_applications(tenant_id,job_id,status,created_at DESC);

CREATE TRIGGER IF NOT EXISTS job_applications_tenant_guard
BEFORE INSERT ON job_applications
BEGIN
  SELECT RAISE(ABORT,'job_opening_tenant_mismatch')
  WHERE NOT EXISTS(
    SELECT 1 FROM job_openings j
    WHERE j.id=NEW.job_id AND j.tenant_id=NEW.tenant_id
  );
END;

CREATE TRIGGER IF NOT EXISTS job_applications_open_guard
BEFORE INSERT ON job_applications
BEGIN
  SELECT RAISE(ABORT,'job_opening_not_accepting_applications')
  WHERE NOT EXISTS(
    SELECT 1 FROM job_openings j
    WHERE j.id=NEW.job_id AND j.tenant_id=NEW.tenant_id AND j.status='open'
      AND (j.closes_on IS NULL OR j.closes_on>=date('now','+2 hours'))
  );
END;
