-- Staged D1 migration. Apply only through a reviewed migration/release process.
-- Existing reviews are intentionally not backfilled or granted new authority.
CREATE TABLE IF NOT EXISTS employee_ai_proposal_provenance (
 tenant_id TEXT NOT NULL,
 proposal_key TEXT NOT NULL,
 author_id TEXT NOT NULL CHECK(length(author_id) BETWEEN 1 AND 200),
 workflow_id TEXT NOT NULL,
 workflow_revision TEXT NOT NULL CHECK(length(workflow_revision)=64 AND workflow_revision NOT GLOB '*[^a-f0-9]*'),
 proposal_revision TEXT NOT NULL CHECK(length(proposal_revision)=64 AND proposal_revision NOT GLOB '*[^a-f0-9]*'),
 workflow_definition TEXT NOT NULL CHECK(json_valid(workflow_definition) AND length(workflow_definition)<=16384),
 proposal_json TEXT NOT NULL CHECK(json_valid(proposal_json) AND length(proposal_json)<=4096),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(tenant_id,proposal_key),
 FOREIGN KEY(tenant_id,proposal_key) REFERENCES employee_ai_proposal_reviews(tenant_id,proposal_key),
 CHECK(json_valid(proposal_key) AND length(proposal_key)<=2048 AND json_array_length(proposal_key)=9),
 CHECK(json_extract(proposal_key,'$[0]') IS 'employee-proposal-v2'),
 CHECK(json_extract(proposal_key,'$[1]') IS tenant_id),
 CHECK(json_extract(proposal_key,'$[2]') IS author_id),
 CHECK(json_extract(proposal_key,'$[3]') IS workflow_id),
 CHECK(json_extract(proposal_key,'$[4]') IS workflow_revision),
 CHECK(json_extract(proposal_key,'$[8]') IS proposal_revision)
);
CREATE INDEX IF NOT EXISTS idx_employee_ai_proposal_provenance_author
 ON employee_ai_proposal_provenance(tenant_id,author_id,workflow_id);

CREATE TRIGGER IF NOT EXISTS trg_employee_ai_provenance_review_binding
BEFORE INSERT ON employee_ai_proposal_provenance
WHEN NOT EXISTS (
 SELECT 1 FROM employee_ai_proposal_reviews r
 WHERE r.tenant_id=NEW.tenant_id AND r.proposal_key=NEW.proposal_key
   AND r.workflow_id=NEW.workflow_id
   AND r.workflow_id=json_extract(NEW.proposal_json,'$.workflowId')
   AND r.employee_id=json_extract(NEW.proposal_json,'$.employeeId')
   AND r.task_type=json_extract(NEW.proposal_json,'$.type')
   AND r.due_date=json_extract(NEW.proposal_json,'$.dueDate')
   AND r.employee_id=json_extract(NEW.proposal_key,'$[5]')
   AND r.task_type=json_extract(NEW.proposal_key,'$[6]')
   AND r.due_date=json_extract(NEW.proposal_key,'$[7]')
)
BEGIN
 SELECT RAISE(ABORT,'proposal_provenance_binding_mismatch');
END;
CREATE TRIGGER IF NOT EXISTS trg_employee_ai_provenance_no_update
BEFORE UPDATE ON employee_ai_proposal_provenance
BEGIN
 SELECT RAISE(ABORT,'proposal_provenance_immutable');
END;
CREATE TRIGGER IF NOT EXISTS trg_employee_ai_provenance_no_delete
BEFORE DELETE ON employee_ai_proposal_provenance
BEGIN
 SELECT RAISE(ABORT,'proposal_provenance_immutable');
END;
