-- SOURCE-ONLY, NEVER EXECUTED. Isolated Essentials private staging D1.
-- Must run AFTER independently approved frozen quotation, customer identity
-- links and verified-customer-session candidate schemas on SAME isolated D1.
-- Do NOT apply on Finance/production, provision routes, or use real customers.
--
-- Only a separately approved trusted freeze host should create new quote rows
-- together with their immutable full contract terms in ONE db.batch. Existing
-- bare frozen-quote rows have no terms; the joined customer reader FAILS CLOSED.
CREATE TABLE essentials_private_frozen_quote_terms (
 tenant_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 quotation_reference TEXT NOT NULL,
 acceptance_version INTEGER NOT NULL CHECK(acceptance_version BETWEEN 1 AND 2147483647),
 total_minor INTEGER NOT NULL CHECK(total_minor>=0),
 quotation_sha256 TEXT NOT NULL
  CHECK(length(quotation_sha256)=64 AND quotation_sha256 NOT GLOB '*[^0-9a-f]*'),
 terms_sha256 TEXT NOT NULL
  CHECK(length(terms_sha256)=64 AND terms_sha256 NOT GLOB '*[^0-9a-f]*'),
 immutable_terms_bytes BLOB NOT NULL
  CHECK(length(immutable_terms_bytes) BETWEEN 1 AND 65536),
 frozen_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,quotation_id),
 FOREIGN KEY(tenant_id,quotation_id)
  REFERENCES essentials_private_frozen_quotes(tenant_id,quotation_id)
);
CREATE TRIGGER essentials_private_terms_no_update
 BEFORE UPDATE ON essentials_private_frozen_quote_terms
 BEGIN SELECT RAISE(ABORT,'frozen_terms_immutable'); END;
CREATE TRIGGER essentials_private_terms_no_delete
 BEFORE DELETE ON essentials_private_frozen_quote_terms
 BEGIN SELECT RAISE(ABORT,'frozen_terms_delete_denied'); END;

CREATE TABLE essentials_private_frozen_quote_terms_audit (
 tenant_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 quotation_sha256 TEXT NOT NULL,
 terms_sha256 TEXT NOT NULL,
 frozen_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,quotation_id),
 FOREIGN KEY(tenant_id,quotation_id)
  REFERENCES essentials_private_frozen_quote_terms(tenant_id,quotation_id)
);
-- The third statement of the freeze host's db.batch() deliberately inserts
-- into this table regardless of zero-row outcome of the preceding terms
-- INSERT SELECT. RAISE(ABORT) rolls the ENTIRE transaction back.
CREATE TRIGGER essentials_private_terms_assert_freeze
 BEFORE INSERT ON essentials_private_frozen_quote_terms_audit
 BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM essentials_private_frozen_quotes AS q
  JOIN essentials_private_frozen_quote_terms AS t
   ON t.tenant_id=q.tenant_id AND t.quotation_id=q.quotation_id
  WHERE q.tenant_id=NEW.tenant_id AND q.quotation_id=NEW.quotation_id
   AND q.state='accepted'
   AND q.quotation_sha256=NEW.quotation_sha256
   AND t.terms_sha256=NEW.terms_sha256
   AND q.frozen_at=NEW.frozen_at AND t.frozen_at=NEW.frozen_at
   AND t.customer_id=q.customer_id
   AND t.quotation_reference=q.quotation_reference
   AND t.acceptance_version=q.acceptance_version
   AND t.total_minor=q.total_minor
   AND t.quotation_sha256=q.quotation_sha256
 ) THEN RAISE(ABORT,'frozen_quote_terms_binding_required') END;
 END;
CREATE TRIGGER essentials_private_terms_audit_no_update
 BEFORE UPDATE ON essentials_private_frozen_quote_terms_audit
 BEGIN SELECT RAISE(ABORT,'terms_freeze_audit_immutable'); END;
CREATE TRIGGER essentials_private_terms_audit_no_delete
 BEFORE DELETE ON essentials_private_frozen_quote_terms_audit
 BEGIN SELECT RAISE(ABORT,'terms_freeze_audit_delete_denied'); END;

-- "offered" means the protected GET host prepared a render for the current
-- customer only. It NEVER asserts a human saw/read/agreed to the terms.
-- Its row can be atomically consumed ONLY by a future separately reviewed
-- customer-specific final consent transaction, not by the GET or boundary.
CREATE TABLE essentials_private_customer_quote_review_offers (
 presentation_id TEXT PRIMARY KEY NOT NULL,
 session_key_sha256 TEXT NOT NULL,
 customer_identity_link_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 quotation_sha256 TEXT NOT NULL CHECK(length(quotation_sha256)=64
  AND quotation_sha256 NOT GLOB '*[^0-9a-f]*'),
 terms_sha256 TEXT NOT NULL CHECK(length(terms_sha256)=64
  AND terms_sha256 NOT GLOB '*[^0-9a-f]*'),
 acceptance_version INTEGER NOT NULL CHECK(acceptance_version BETWEEN 1 AND 2147483647),
 total_minor INTEGER NOT NULL CHECK(total_minor>=0),
 issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0),
 expires_at_ms INTEGER NOT NULL CHECK(
  expires_at_ms>issued_at_ms AND expires_at_ms-issued_at_ms<=300000),
 state TEXT NOT NULL DEFAULT 'offered'
  CHECK(state IN ('offered','consumed','revoked')),
 used_at_ms INTEGER,
 CHECK((state='offered' AND used_at_ms IS NULL) OR
       (state IN ('consumed','revoked') AND used_at_ms IS NOT NULL)),
 FOREIGN KEY(session_key_sha256)
  REFERENCES essentials_private_customer_consent_sessions(session_key_sha256),
 FOREIGN KEY(customer_identity_link_id)
  REFERENCES essentials_private_customer_identity_links(link_id),
 FOREIGN KEY(tenant_id,quotation_id)
  REFERENCES essentials_private_frozen_quote_terms(tenant_id,quotation_id)
);
CREATE INDEX essentials_private_customer_review_active
 ON essentials_private_customer_quote_review_offers(
  session_key_sha256,tenant_id,customer_id,quotation_id,state,expires_at_ms);
CREATE TRIGGER essentials_private_customer_review_no_delete
 BEFORE DELETE ON essentials_private_customer_quote_review_offers
 BEGIN SELECT RAISE(ABORT,'customer_review_delete_denied'); END;
CREATE TRIGGER essentials_private_customer_review_immutable
 BEFORE UPDATE ON essentials_private_customer_quote_review_offers
 WHEN OLD.state<>'offered' OR NEW.state NOT IN ('consumed','revoked')
 OR NEW.presentation_id IS NOT OLD.presentation_id
 OR NEW.session_key_sha256 IS NOT OLD.session_key_sha256
 OR NEW.customer_identity_link_id IS NOT OLD.customer_identity_link_id
 OR NEW.tenant_id IS NOT OLD.tenant_id
 OR NEW.customer_id IS NOT OLD.customer_id
 OR NEW.quotation_id IS NOT OLD.quotation_id
 OR NEW.quotation_sha256 IS NOT OLD.quotation_sha256
 OR NEW.terms_sha256 IS NOT OLD.terms_sha256
 OR NEW.acceptance_version IS NOT OLD.acceptance_version
 OR NEW.total_minor IS NOT OLD.total_minor
 OR NEW.issued_at_ms IS NOT OLD.issued_at_ms
 OR NEW.expires_at_ms IS NOT OLD.expires_at_ms
 OR NEW.used_at_ms IS NULL
 BEGIN SELECT RAISE(ABORT,'customer_review_immutable'); END;
