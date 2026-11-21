-- C4 APPROVED-QUOTE SOURCE REGISTRY: REVIEW ONLY, NEVER EXECUTED.
--
-- Exact intended *future* isolated quotation D1:
-- bw-quotation-staging, UUID aec227e9-b0f2-4b00-8de0-105465c4e2d6.
-- NO authority to apply DDL, bind any Worker, change production or
-- repurpose the existing quotation_drafts table is granted by this file.
--
-- This is an isolated synthetic-evidence registry for private staging.
-- It cannot establish a real customer-to-quote relationship without
-- independently approved active Finance customer and business issuance
-- checks. SQL never joins production D1, Google OIDC or customer consent D1.
-- Full immutable quote/terms bytes are stored TOGETHER in one row.
-- Separate assertion row is mandatory for an authorized read.
-- Audit, publication and revocation rows are append-only.
--
-- The business source must compute/verify SHA-256 and approve issuance;
-- SQLite has no native SHA-256 verification function. Schema CHECK(length)
-- is NOT a cryptographic authority check.
CREATE TABLE c4_quotation_approved_publications (
 tenant_id TEXT NOT NULL
  CHECK(length(tenant_id) BETWEEN 1 AND 100
    AND tenant_id NOT GLOB '*[^A-Za-z0-9_-]*'),
 quotation_id TEXT NOT NULL
  CHECK(length(quotation_id) BETWEEN 1 AND 100
    AND quotation_id NOT GLOB '*[^A-Za-z0-9_-]*'),
 customer_id TEXT NOT NULL
  CHECK(length(customer_id) BETWEEN 1 AND 100
    AND customer_id NOT GLOB '*[^A-Za-z0-9_-]*'),
 quotation_reference TEXT NOT NULL
  CHECK(length(quotation_reference) BETWEEN 1 AND 100
    AND quotation_reference NOT GLOB '*[^A-Za-z0-9_-]*'),
 approval_evidence_id TEXT NOT NULL
  CHECK(length(approval_evidence_id) BETWEEN 1 AND 100
    AND approval_evidence_id NOT GLOB '*[^A-Za-z0-9_-]*'),
 approved_by_actor_user_id TEXT NOT NULL
  CHECK(length(approved_by_actor_user_id) BETWEEN 1 AND 100
    AND approved_by_actor_user_id NOT GLOB '*[^A-Za-z0-9_-]*'),
 acceptance_version INTEGER NOT NULL
  CHECK(typeof(acceptance_version)='integer'
    AND acceptance_version BETWEEN 1 AND 2147483647),
 total_minor INTEGER NOT NULL
  CHECK(typeof(total_minor)='integer' AND total_minor>=0),
 currency TEXT NOT NULL DEFAULT 'BWP' CHECK(currency='BWP'),
 quotation_sha256 TEXT NOT NULL
  CHECK(length(quotation_sha256)=64
    AND quotation_sha256 NOT GLOB '*[^a-f0-9]*'),
 terms_sha256 TEXT NOT NULL
  CHECK(length(terms_sha256)=64
    AND terms_sha256 NOT GLOB '*[^a-f0-9]*'),
 immutable_quotation_bytes BLOB NOT NULL
  CHECK(typeof(immutable_quotation_bytes)='blob'
    AND length(immutable_quotation_bytes) BETWEEN 1 AND 131072),
 immutable_terms_bytes BLOB NOT NULL
  CHECK(typeof(immutable_terms_bytes)='blob'
    AND length(immutable_terms_bytes) BETWEEN 1 AND 65536),
 state TEXT NOT NULL DEFAULT 'approved-for-issuance'
  CHECK(state='approved-for-issuance'),
 approved_at_ms INTEGER NOT NULL CHECK(approved_at_ms>0),
 PRIMARY KEY(tenant_id,quotation_id),
 UNIQUE(tenant_id,quotation_reference),
 UNIQUE(tenant_id,approval_evidence_id)
);
CREATE TRIGGER c4_quotation_approved_no_update
 BEFORE UPDATE ON c4_quotation_approved_publications
 BEGIN SELECT RAISE(ABORT,'c4_approved_quote_immutable'); END;
CREATE TRIGGER c4_quotation_approved_no_delete
 BEFORE DELETE ON c4_quotation_approved_publications
 BEGIN SELECT RAISE(ABORT,'c4_approved_quote_delete_denied'); END;

-- A separate audit row proves the approved publication committed as one
-- approved business action. Never create this row in an independent request.
CREATE TABLE c4_quotation_approval_assertions (
 tenant_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 approval_evidence_id TEXT NOT NULL,
 quotation_sha256 TEXT NOT NULL,
 terms_sha256 TEXT NOT NULL,
 approved_at_ms INTEGER NOT NULL,
 PRIMARY KEY(tenant_id,quotation_id),
 FOREIGN KEY(tenant_id,quotation_id)
  REFERENCES c4_quotation_approved_publications(tenant_id,quotation_id)
);
CREATE TRIGGER c4_quotation_approval_assert_guard
 BEFORE INSERT ON c4_quotation_approval_assertions
 BEGIN
  SELECT CASE WHEN NOT EXISTS (
   SELECT 1 FROM c4_quotation_approved_publications AS p
   WHERE p.tenant_id=NEW.tenant_id
    AND p.quotation_id=NEW.quotation_id
    AND p.customer_id=NEW.customer_id
    AND p.approval_evidence_id=NEW.approval_evidence_id
    AND p.quotation_sha256=NEW.quotation_sha256
    AND p.terms_sha256=NEW.terms_sha256
    AND p.approved_at_ms=NEW.approved_at_ms
    AND p.state='approved-for-issuance'
  ) THEN RAISE(ABORT,'c4_approved_quote_assertion_mismatch') END;
 END;
CREATE TRIGGER c4_quotation_assertion_no_update
 BEFORE UPDATE ON c4_quotation_approval_assertions
 BEGIN SELECT RAISE(ABORT,'c4_approval_assertion_immutable'); END;
CREATE TRIGGER c4_quotation_assertion_no_delete
 BEFORE DELETE ON c4_quotation_approval_assertions
 BEGIN SELECT RAISE(ABORT,'c4_approval_assertion_delete_denied'); END;

-- Revocation does not rewrite/delete an immutable published quotation.
-- It is a permanent, single-use tombstone for that exact tenant+quote.
CREATE TABLE c4_quotation_approval_revocations (
 tenant_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 revoked_by_actor_user_id TEXT NOT NULL
  CHECK(length(revoked_by_actor_user_id) BETWEEN 1 AND 100
    AND revoked_by_actor_user_id NOT GLOB '*[^A-Za-z0-9_-]*'),
 revocation_evidence_id TEXT NOT NULL
  CHECK(length(revocation_evidence_id) BETWEEN 1 AND 100
    AND revocation_evidence_id NOT GLOB '*[^A-Za-z0-9_-]*'),
 revoked_at_ms INTEGER NOT NULL CHECK(revoked_at_ms>0),
 PRIMARY KEY(tenant_id,quotation_id),
 UNIQUE(tenant_id,revocation_evidence_id),
 FOREIGN KEY(tenant_id,quotation_id)
  REFERENCES c4_quotation_approved_publications(tenant_id,quotation_id)
);
CREATE TRIGGER c4_quotation_revoke_guard
 BEFORE INSERT ON c4_quotation_approval_revocations
 BEGIN
  SELECT CASE WHEN NOT EXISTS(
   SELECT 1 FROM c4_quotation_approved_publications AS p
   JOIN c4_quotation_approval_assertions AS a
    ON a.tenant_id=p.tenant_id AND a.quotation_id=p.quotation_id
   WHERE p.tenant_id=NEW.tenant_id
    AND p.quotation_id=NEW.quotation_id
    AND NEW.revoked_at_ms>=p.approved_at_ms
  ) THEN RAISE(ABORT,'c4_approved_quote_cannot_revoke_unasserted') END;
 END;
CREATE TRIGGER c4_quotation_revocation_no_update
 BEFORE UPDATE ON c4_quotation_approval_revocations
 BEGIN SELECT RAISE(ABORT,'c4_quote_revocation_immutable'); END;
CREATE TRIGGER c4_quotation_revocation_no_delete
 BEFORE DELETE ON c4_quotation_approval_revocations
 BEGIN SELECT RAISE(ABORT,'c4_quote_revocation_delete_denied'); END;

CREATE INDEX c4_quotation_approved_customer_idx
 ON c4_quotation_approved_publications(tenant_id,customer_id,approved_at_ms);
