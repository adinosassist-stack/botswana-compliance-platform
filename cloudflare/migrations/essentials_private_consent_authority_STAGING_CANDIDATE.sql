-- SOURCE-ONLY CANDIDATE for one ISOLATED Essentials private staging D1.
-- DO NOT EXECUTE OR BIND without explicit exact-SQL, D1, backup and independent approvals.
-- Not compatible with production Finance; all rows must be synthetic.
-- Schema preserves accepted/revoked evidence; revocation cannot be undone.
PRAGMA foreign_keys=ON;

CREATE TABLE essentials_private_frozen_quotes (
 tenant_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 quotation_reference TEXT NOT NULL,
 acceptance_version INTEGER NOT NULL CHECK (acceptance_version BETWEEN 1 AND 2147483647),
 total_minor INTEGER NOT NULL CHECK(total_minor>=0),
 quotation_sha256 TEXT NOT NULL CHECK(length(quotation_sha256)=64 AND quotation_sha256 NOT GLOB '*[^0-9a-f]*'),
 immutable_quotation_bytes BLOB NOT NULL CHECK(length(immutable_quotation_bytes) BETWEEN 1 AND 131072),
 frozen_by_actor_user_id TEXT NOT NULL,
 frozen_at TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'accepted' CHECK(state IN ('accepted','revoked')),
 PRIMARY KEY (tenant_id,quotation_id)
);
CREATE TRIGGER essentials_private_frozen_immutable BEFORE UPDATE
 ON essentials_private_frozen_quotes
 WHEN NEW.tenant_id<>OLD.tenant_id OR NEW.quotation_id<>OLD.quotation_id
 OR NEW.customer_id<>OLD.customer_id OR NEW.quotation_reference<>OLD.quotation_reference
 OR NEW.acceptance_version<>OLD.acceptance_version OR NEW.total_minor<>OLD.total_minor
 OR NEW.quotation_sha256<>OLD.quotation_sha256
 OR NEW.immutable_quotation_bytes<>OLD.immutable_quotation_bytes
 OR NEW.frozen_by_actor_user_id<>OLD.frozen_by_actor_user_id OR NEW.frozen_at<>OLD.frozen_at
 OR OLD.state='revoked' OR NEW.state<>'revoked'
 BEGIN SELECT RAISE(ABORT,'frozen_quote_immutable'); END;
CREATE TRIGGER essentials_private_frozen_no_delete BEFORE DELETE
 ON essentials_private_frozen_quotes BEGIN SELECT RAISE(ABORT,'frozen_quote_delete_denied'); END;

CREATE TABLE essentials_private_verified_consents (
 tenant_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 quotation_reference TEXT NOT NULL,
 acceptance_version INTEGER NOT NULL CHECK (acceptance_version BETWEEN 1 AND 2147483647),
 total_minor INTEGER NOT NULL CHECK(total_minor>=0),
 quotation_sha256 TEXT NOT NULL CHECK(length(quotation_sha256)=64 AND quotation_sha256 NOT GLOB '*[^0-9a-f]*'),
 consent_sha256 TEXT NOT NULL CHECK(length(consent_sha256)=64 AND consent_sha256 NOT GLOB '*[^0-9a-f]*'),
 immutable_consent_bytes BLOB NOT NULL CHECK(length(immutable_consent_bytes) BETWEEN 1 AND 131072),
 consent_subject_id TEXT NOT NULL,
 actor_user_id TEXT NOT NULL,
 accepted_at TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'accepted' CHECK(state IN ('accepted','revoked')),
 PRIMARY KEY (tenant_id,quotation_id),
 FOREIGN KEY (tenant_id,quotation_id) REFERENCES essentials_private_frozen_quotes(tenant_id,quotation_id)
);
CREATE TRIGGER essentials_private_consent_immutable BEFORE UPDATE
 ON essentials_private_verified_consents
 WHEN NEW.tenant_id<>OLD.tenant_id OR NEW.quotation_id<>OLD.quotation_id
 OR NEW.customer_id<>OLD.customer_id OR NEW.quotation_reference<>OLD.quotation_reference
 OR NEW.acceptance_version<>OLD.acceptance_version OR NEW.total_minor<>OLD.total_minor
 OR NEW.quotation_sha256<>OLD.quotation_sha256 OR NEW.consent_sha256<>OLD.consent_sha256
 OR NEW.immutable_consent_bytes<>OLD.immutable_consent_bytes
 OR NEW.consent_subject_id<>OLD.consent_subject_id OR NEW.actor_user_id<>OLD.actor_user_id
 OR NEW.accepted_at<>OLD.accepted_at OR OLD.state='revoked' OR NEW.state<>'revoked'
 BEGIN SELECT RAISE(ABORT,'verified_consent_immutable'); END;
CREATE TRIGGER essentials_private_consent_no_delete BEFORE DELETE
 ON essentials_private_verified_consents BEGIN SELECT RAISE(ABORT,'verified_consent_delete_denied'); END;

CREATE TABLE essentials_private_signed_receipts (
 tenant_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 receipt_id TEXT NOT NULL UNIQUE,
 actor_user_id TEXT NOT NULL,
 quotation_sha256 TEXT NOT NULL,
 consent_sha256 TEXT NOT NULL,
 receipt_payload_json TEXT NOT NULL CHECK(json_valid(receipt_payload_json)),
 signature TEXT NOT NULL CHECK(length(signature)=86),
 issued_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'issued' CHECK(state IN ('issued','revoked')),
 PRIMARY KEY (tenant_id,quotation_id),
 FOREIGN KEY (tenant_id,quotation_id) REFERENCES essentials_private_frozen_quotes(tenant_id,quotation_id),
 FOREIGN KEY (tenant_id,quotation_id) REFERENCES essentials_private_verified_consents(tenant_id,quotation_id)
);
CREATE TRIGGER essentials_private_receipt_immutable BEFORE UPDATE
 ON essentials_private_signed_receipts
 WHEN NEW.tenant_id<>OLD.tenant_id OR NEW.quotation_id<>OLD.quotation_id
 OR NEW.receipt_id<>OLD.receipt_id OR NEW.actor_user_id<>OLD.actor_user_id
 OR NEW.quotation_sha256<>OLD.quotation_sha256 OR NEW.consent_sha256<>OLD.consent_sha256
 OR NEW.receipt_payload_json<>OLD.receipt_payload_json OR NEW.signature<>OLD.signature
 OR NEW.issued_at<>OLD.issued_at OR NEW.expires_at<>OLD.expires_at
 OR OLD.state='revoked' OR NEW.state<>'revoked'
 BEGIN SELECT RAISE(ABORT,'signed_receipt_immutable'); END;
CREATE TRIGGER essentials_private_receipt_no_delete BEFORE DELETE
 ON essentials_private_signed_receipts BEGIN SELECT RAISE(ABORT,'signed_receipt_delete_denied'); END;
