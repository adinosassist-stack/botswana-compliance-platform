-- STAGING-ONLY CANDIDATE. DO NOT EXECUTE without exact SQL, D1 and recovery approvals.
-- This is a new authoritative accepted-quotation snapshot, NOT a migration
-- of existing editable quotation drafts; no real customer data is copied here.
CREATE TABLE essentials_accepted_quotation_snapshots (
 tenant_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 quotation_reference TEXT NOT NULL,
 acceptance_version INTEGER NOT NULL CHECK(acceptance_version BETWEEN 1 AND 2147483647),
 total_minor INTEGER NOT NULL CHECK(total_minor>=0),
 accepted_by_user_id TEXT NOT NULL,
 accepted_at TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'accepted' CHECK(state IN ('accepted','revoked')),
 PRIMARY KEY (tenant_id,quotation_id),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),
 FOREIGN KEY(customer_id) REFERENCES finance_customers(id),
 FOREIGN KEY(accepted_by_user_id) REFERENCES users(id)
);
-- Prevent all changes except irreversible revocation of existing acceptance.
CREATE TRIGGER essentials_accepted_snapshot_immutable
BEFORE UPDATE ON essentials_accepted_quotation_snapshots
WHEN NEW.tenant_id<>OLD.tenant_id OR NEW.quotation_id<>OLD.quotation_id
 OR NEW.customer_id<>OLD.customer_id OR NEW.quotation_reference<>OLD.quotation_reference
 OR NEW.acceptance_version<>OLD.acceptance_version OR NEW.total_minor<>OLD.total_minor
 OR NEW.accepted_by_user_id<>OLD.accepted_by_user_id OR NEW.accepted_at<>OLD.accepted_at
 OR OLD.state='revoked' OR NEW.state<>'revoked'
BEGIN
 SELECT RAISE(ABORT,'essentials_acceptance_immutable');
END;
CREATE TRIGGER essentials_accepted_snapshot_no_delete
BEFORE DELETE ON essentials_accepted_quotation_snapshots
BEGIN
 SELECT RAISE(ABORT,'essentials_acceptance_delete_denied');
END;
CREATE TRIGGER essentials_accepted_snapshot_customer_guard
BEFORE INSERT ON essentials_accepted_quotation_snapshots
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM finance_customers AS c
  WHERE c.id=NEW.customer_id AND c.tenant_id=NEW.tenant_id AND c.status='active'
 ) THEN RAISE(ABORT,'essentials_acceptance_customer_invalid') END;
END;
