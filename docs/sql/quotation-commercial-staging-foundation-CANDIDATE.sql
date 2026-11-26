-- REVIEW ONLY. Exact proposed target: bw-quotation-staging
-- UUID aec227e9-b0f2-4b00-8de0-105465c4e2d6. Never production or invoice sandbox.
-- Adds missing foundations; leaves quotation_drafts/logo tables untouched.
-- Execute only after exact-resource/checksum/operator/recovery approvals.
-- Order: this file, canonical 049_v108_finance_receivables.sql, commercial candidate.
-- No IF NOT EXISTS: unexpected existing foundations require a fresh preflight.
-- No users, customers, sessions, bank details or receipts are seeded by this file.
-- Private host exposes no transaction/allocation/customer creation endpoint.
CREATE TABLE tenants (id TEXT PRIMARY KEY);
CREATE TABLE users (id TEXT PRIMARY KEY);
CREATE TABLE finance_transactions (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id),
 amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer')
);
