-- Corporate Assets V1: additive PostgreSQL migration. Not for Cloudflare D1.
-- Requires existing public.companies(id UUID). Apply only through reviewed staging migration.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS corporate_assets (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
 asset_name VARCHAR(255) NOT NULL CHECK (length(btrim(asset_name))>0),
 asset_category VARCHAR(50) NOT NULL CHECK (asset_category IN ('Fleet','IT Hardware','Machinery','Office Furniture','Other')),
 serial_number_or_vin VARCHAR(100),
 assigned_branch VARCHAR(100) NOT NULL CHECK (length(btrim(assigned_branch))>0),
 custodian_employee_name VARCHAR(255),
 acquisition_date DATE NOT NULL,
 acquisition_cost_bwp NUMERIC(14,2) NOT NULL CHECK (acquisition_cost_bwp>=0),
 current_book_value_bwp NUMERIC(14,2) NOT NULL CHECK (current_book_value_bwp>=0),
 depreciation_rate_percentage NUMERIC(5,2) NOT NULL DEFAULT 15 CHECK (depreciation_rate_percentage BETWEEN 0 AND 100),
 status VARCHAR(30) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','In Maintenance','Written Off','Decommissioned')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(company_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS corporate_assets_serial_tenant_unique ON corporate_assets(company_id,lower(btrim(serial_number_or_vin))) WHERE NULLIF(btrim(serial_number_or_vin),'') IS NOT NULL;
CREATE INDEX IF NOT EXISTS corporate_assets_tenant_status_idx ON corporate_assets(company_id,status);
CREATE TABLE IF NOT EXISTS asset_maintenance_logs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id UUID NOT NULL,
 asset_id UUID NOT NULL,
 service_type VARCHAR(50) NOT NULL CHECK (service_type IN ('Routine Service','Repair','Insurance Renewal','Warranty Claim')),
 description TEXT NOT NULL CHECK(length(btrim(description))>0),
 service_provider VARCHAR(255),
 cost_bwp NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(cost_bwp>=0),
 service_date DATE NOT NULL,
 next_due_date DATE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,asset_id) REFERENCES corporate_assets(company_id,id) ON DELETE RESTRICT,
 CHECK(next_due_date IS NULL OR next_due_date>=service_date)
);
CREATE INDEX IF NOT EXISTS asset_maintenance_tenant_due_idx ON asset_maintenance_logs(company_id,next_due_date) WHERE next_due_date IS NOT NULL;
CREATE TABLE IF NOT EXISTS asset_insurance_policies (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id UUID NOT NULL,
 asset_id UUID NOT NULL,
 insurer VARCHAR(255) NOT NULL CHECK(length(btrim(insurer))>0),
 policy_number VARCHAR(120) NOT NULL CHECK(length(btrim(policy_number))>0),
 coverage_start DATE NOT NULL,
 coverage_end DATE NOT NULL,
 annual_premium_bwp NUMERIC(14,2) NOT NULL CHECK(annual_premium_bwp>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,asset_id) REFERENCES corporate_assets(company_id,id) ON DELETE RESTRICT,
 CHECK(coverage_end>=coverage_start),
 UNIQUE(company_id,insurer,policy_number)
);
CREATE INDEX IF NOT EXISTS asset_insurance_tenant_expiry_idx ON asset_insurance_policies(company_id,coverage_end);
-- Direct table access is disabled pending a vetted application role + RLS migration.
REVOKE ALL ON corporate_assets,asset_maintenance_logs,asset_insurance_policies FROM PUBLIC;
ALTER TABLE corporate_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE corporate_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE asset_maintenance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_maintenance_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE asset_insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_insurance_policies FORCE ROW LEVEL SECURITY;
