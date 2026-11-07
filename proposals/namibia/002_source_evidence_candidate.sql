-- Namibia regulatory provenance candidate ONLY; never included in cloudflare/migrations.
-- For disposable D1 integration rehearsal; no source bodies, personal data, or PII.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS na_source_versions (
  source_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 99999),
  authority TEXT NOT NULL CHECK (authority IN ('bipa','namra','fic')),
  source_url TEXT NOT NULL,
  captured_at TEXT NOT NULL CHECK(length(captured_at)=10),
  content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64 AND content_sha256 NOT GLOB '*[^0-9a-f]*'),
  byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 1 AND 2000000),
  status TEXT NOT NULL DEFAULT 'integrity_checked_unreviewed'
    CHECK(status='integrity_checked_unreviewed'),
  legal_approved INTEGER NOT NULL DEFAULT 0 CHECK(legal_approved=0),
  release_enabled INTEGER NOT NULL DEFAULT 0 CHECK(release_enabled=0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_id,revision)
);
CREATE INDEX IF NOT EXISTS na_source_versions_authority_idx
 ON na_source_versions(authority,captured_at DESC);
CREATE TRIGGER IF NOT EXISTS na_source_versions_no_update BEFORE UPDATE ON na_source_versions
 BEGIN SELECT RAISE(ABORT,'namibia_source_append_only'); END;
CREATE TRIGGER IF NOT EXISTS na_source_versions_no_delete BEFORE DELETE ON na_source_versions
 BEGIN SELECT RAISE(ABORT,'namibia_source_append_only'); END;

CREATE TABLE IF NOT EXISTS na_source_review_notes (
  note_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_revision INTEGER NOT NULL,
  reviewer_ref TEXT NOT NULL,
  finding TEXT NOT NULL CHECK(finding IN
    ('needs_source_verification','requires_legal_opinion','needs_revision','out_of_scope')),
  rationale TEXT NOT NULL CHECK(length(rationale) BETWEEN 1 AND 2000),
  approval_granted INTEGER NOT NULL DEFAULT 0 CHECK(approval_granted=0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(source_id,source_revision) REFERENCES na_source_versions(source_id,revision) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS na_source_review_notes_source_idx
 ON na_source_review_notes(source_id,source_revision,created_at DESC);
CREATE TRIGGER IF NOT EXISTS na_source_review_notes_no_update BEFORE UPDATE ON na_source_review_notes
 BEGIN SELECT RAISE(ABORT,'namibia_review_note_append_only'); END;
CREATE TRIGGER IF NOT EXISTS na_source_review_notes_no_delete BEFORE DELETE ON na_source_review_notes
 BEGIN SELECT RAISE(ABORT,'namibia_review_note_append_only'); END;
