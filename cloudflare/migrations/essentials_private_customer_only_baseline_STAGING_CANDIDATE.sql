-- CLEAN CUSTOMER-ONLY D1 BASELINE, SOURCE ONLY, NEVER EXECUTED.
-- For exactly the NEW isolated private synthetic customer D1. This
-- duplicates ONLY the frozen quote table and its two immutable triggers
-- from the legacy employee-era candidate, preserving their behavior.
-- LEGACY employee actor consent and signed-receipt tables intentionally
-- excluded. Original legacy file remains unchanged for old tests.
-- DO NOT execute without new exact-byte source, D1, privacy/recovery
-- owner + independent thusico approval. No worker or production route.
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
