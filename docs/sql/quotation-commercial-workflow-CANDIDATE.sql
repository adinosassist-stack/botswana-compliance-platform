-- SOURCE CANDIDATE ONLY. Apply only after separate exact-resource/schema approval.
-- Reuses tenants and finance_customers/finance_invoices. No payment allocation.
CREATE TABLE quotation_company_banking (
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id), revision INTEGER NOT NULL CHECK(revision>0),
 banking_json TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE quotation_commercial_sequences (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), kind TEXT NOT NULL CHECK(kind IN ('quote','invoice')),
 value INTEGER NOT NULL CHECK(value>0), PRIMARY KEY(tenant_id,kind)
);
CREATE TABLE quotation_commercial_documents (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('quote','invoice')),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued')), revision INTEGER NOT NULL CHECK(revision>0),
 document_json TEXT NOT NULL, number TEXT, source_quote_id TEXT, finance_customer_id TEXT, finance_invoice_id TEXT, due_on TEXT,
 total_minor INTEGER NOT NULL CHECK(total_minor>=0), schedule_json TEXT NOT NULL DEFAULT '{}',
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,kind,number), UNIQUE(tenant_id,source_quote_id),
 CHECK((status='draft' AND number IS NULL) OR (status='issued' AND number IS NOT NULL))
);
CREATE TABLE quotation_commercial_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 entity_id TEXT NOT NULL, action TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER quotation_banking_created AFTER INSERT ON quotation_company_banking BEGIN
 INSERT INTO quotation_commercial_audit(tenant_id,actor_id,entity_id,action,revision)
 VALUES(NEW.tenant_id,NEW.updated_by,'company_banking','created',NEW.revision);
END;
CREATE TRIGGER quotation_banking_updated AFTER UPDATE ON quotation_company_banking BEGIN
 INSERT INTO quotation_commercial_audit(tenant_id,actor_id,entity_id,action,revision)
 VALUES(NEW.tenant_id,NEW.updated_by,'company_banking','updated',NEW.revision);
END;
CREATE TRIGGER quotation_document_created AFTER INSERT ON quotation_commercial_documents BEGIN
 INSERT INTO quotation_commercial_audit(tenant_id,actor_id,entity_id,action,revision)
 VALUES(NEW.tenant_id,NEW.updated_by,NEW.id,'created',NEW.revision);
END;
CREATE TRIGGER quotation_document_updated AFTER UPDATE ON quotation_commercial_documents BEGIN
 INSERT INTO quotation_commercial_audit(tenant_id,actor_id,entity_id,action,revision)
 VALUES(NEW.tenant_id,NEW.updated_by,NEW.id,NEW.status,NEW.revision);
END;
CREATE TRIGGER quotation_issued_immutable BEFORE UPDATE ON quotation_commercial_documents WHEN OLD.status='issued' BEGIN
 SELECT RAISE(ABORT,'issued_document_immutable');
END;
CREATE TRIGGER quotation_issued_no_delete BEFORE DELETE ON quotation_commercial_documents WHEN OLD.status='issued' BEGIN
 SELECT RAISE(ABORT,'issued_document_immutable');
END;
